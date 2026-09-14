package auth

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	"infinite-canvas/backend/internal/kernel"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/outbound"

	"gorm.io/gorm"
)

const (
	smsSettingKey            = "sms"
	smsProviderAliyun        = "aliyun"
	smsProviderStandard      = "standard"
	aliyunSMSEndpoint        = "https://dysmsapi.aliyuncs.com/"
	registrationPhonePurpose = "registration"
	phoneCodeCooldown        = time.Minute
	maxPhoneCodeAttempts     = 5
)

type SMSSettingRequest struct {
	Enabled         bool   `json:"enabled"`
	Provider        string `json:"provider"`
	AccessKeyID     string `json:"accessKeyId"`
	AccessKeySecret string `json:"accessKeySecret"`
	SignName        string `json:"signName"`
	TemplateCode    string `json:"templateCode"`
	Endpoint        string `json:"endpoint"`
	APIKey          string `json:"apiKey"`
	provided        map[string]struct{}
}

// UnmarshalJSON remembers which fields were present so PATCH requests can
// update one setting without clearing the other provider fields.
func (r *SMSSettingRequest) UnmarshalJSON(data []byte) error {
	type smsSettingRequest SMSSettingRequest
	var decoded smsSettingRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}
	*r = SMSSettingRequest(decoded)
	r.provided = make(map[string]struct{}, len(fields))
	for field := range fields {
		r.provided[field] = struct{}{}
	}
	return nil
}

func (r SMSSettingRequest) fieldProvided(field string) bool {
	if r.provided == nil {
		// Programmatic callers historically supplied a complete request.
		return true
	}
	_, ok := r.provided[field]
	return ok
}

type PublicSMSSetting struct {
	Enabled            bool      `json:"enabled"`
	Configured         bool      `json:"configured"`
	Provider           string    `json:"provider"`
	AccessKeyID        string    `json:"accessKeyId"`
	HasAccessKeySecret bool      `json:"hasAccessKeySecret"`
	SignName           string    `json:"signName"`
	TemplateCode       string    `json:"templateCode"`
	Endpoint           string    `json:"endpoint"`
	HasAPIKey          bool      `json:"hasApiKey"`
	UpdatedBy          string    `json:"updatedBy"`
	CreatedAt          time.Time `json:"createdAt"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

type SMSSettingValue struct {
	Enabled         bool   `json:"enabled"`
	Provider        string `json:"provider"`
	AccessKeyID     string `json:"accessKeyId"`
	AccessKeySecret string `json:"accessKeySecret"`
	SignName        string `json:"signName"`
	TemplateCode    string `json:"templateCode"`
	Endpoint        string `json:"endpoint"`
	APIKey          string `json:"apiKey"`
}

type PhoneCodeCooldownError struct{ Seconds int }

func (e *PhoneCodeCooldownError) Error() string {
	return fmt.Sprintf("验证码已发送，请稍候；%d 秒后可以重新获取", e.Seconds)
}

var mainlandPhonePattern = regexp.MustCompile(`^1[3-9][0-9]{9}$`)

func (s *Service) AdminSMSSetting(actor *model.User) (*PublicSMSSetting, error) {
	if err := s.host.RequireAdmin(actor); err != nil {
		return nil, err
	}
	setting, value, err := s.readSMSSetting()
	if err != nil {
		return nil, err
	}
	return s.publicSMSSetting(setting, value), nil
}

func (s *Service) UpdateSMSSetting(actor *model.User, req SMSSettingRequest) (*PublicSMSSetting, error) {
	if err := s.host.RequireAdmin(actor); err != nil {
		return nil, err
	}
	currentSetting, current, err := s.readSMSSetting()
	if err != nil {
		return nil, err
	}
	next := current
	if req.fieldProvided("enabled") {
		next.Enabled = req.Enabled
	}
	if req.fieldProvided("provider") {
		next.Provider = req.Provider
	}
	if req.fieldProvided("accessKeyId") {
		next.AccessKeyID = req.AccessKeyID
	}
	if req.fieldProvided("signName") {
		next.SignName = req.SignName
	}
	if req.fieldProvided("templateCode") {
		next.TemplateCode = req.TemplateCode
	}
	if req.fieldProvided("endpoint") {
		next.Endpoint = req.Endpoint
	}
	if req.AccessKeySecret != "" {
		next.AccessKeySecret = req.AccessKeySecret
	}
	if req.APIKey != "" {
		next.APIKey = req.APIKey
	}
	next = normalizeSMSSetting(next)
	if err := validateSMSSetting(next); err != nil {
		return nil, err
	}
	stored := next
	stored.AccessKeySecret, err = s.host.EncryptSecret(next.AccessKeySecret)
	if err != nil {
		return nil, err
	}
	stored.APIKey, err = s.host.EncryptSecret(next.APIKey)
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(stored)
	if err != nil {
		return nil, err
	}
	setting := model.SystemSetting{Key: smsSettingKey, ValueJSON: string(encoded), UpdatedBy: actor.ID}
	if currentSetting != nil {
		setting.CreatedAt = currentSetting.CreatedAt
	}
	if err := s.repo.SaveSystemSetting(&setting); err != nil {
		return nil, err
	}
	return s.publicSMSSetting(&setting, next), nil
}

func (s *Service) SMSEnabled() (bool, error) {
	_, value, err := s.readSMSSetting()
	if err != nil {
		return false, err
	}
	return value.Enabled && smsSettingConfigured(value), nil
}

func (s *Service) SMSVerificationRequired() (bool, error) {
	_, value, err := s.readSMSSetting()
	if err != nil {
		return false, err
	}
	return value.Enabled, nil
}

func (s *Service) SendRegistrationPhoneCode(rawPhone string) error {
	return s.sendRegistrationPhoneCode(context.Background(), rawPhone)
}

func (s *Service) SendRegistrationPhoneCodeContext(ctx context.Context, rawPhone string) error {
	return s.sendRegistrationPhoneCode(ctx, rawPhone)
}

func (s *Service) sendRegistrationPhoneCode(ctx context.Context, rawPhone string) error {
	if ctx == nil {
		ctx = context.Background()
	}
	phone := NormalizePhone(rawPhone)
	if err := ValidatePhone(phone); err != nil {
		return err
	}
	count, err := s.repo.UserCount()
	if err != nil {
		return err
	}
	if count == 0 {
		return kernel.BadAuthRequest("首个管理员账号不需要手机验证码")
	}
	registrationEnabled, err := s.RegistrationEnabled()
	if err != nil {
		return err
	}
	if !registrationEnabled {
		return kernel.Forbidden("管理员未开放新用户注册")
	}
	_, setting, err := s.readSMSSetting()
	if err != nil {
		return err
	}
	if !setting.Enabled {
		return kernel.Forbidden("平台尚未启用手机验证码验证，请联系管理员")
	}
	if err := validateSMSSetting(setting); err != nil {
		return err
	}
	rateKey := phoneCodeRateLimitKey(phone)
	allowed, err := s.host.AllowRequest(ctx, rateKey, 1, phoneCodeCooldown)
	if err != nil {
		return err
	}
	if !allowed {
		wait := s.host.RequestRetryAfter(ctx, rateKey, phoneCodeCooldown)
		seconds := max(1, int((wait+time.Second-1)/time.Second))
		return &PhoneCodeCooldownError{Seconds: seconds}
	}
	if latest, err := s.repo.LatestPhoneVerificationCode(phone, registrationPhonePurpose); err == nil && time.Since(latest.CreatedAt) < phoneCodeCooldown {
		seconds := max(1, int((time.Until(latest.CreatedAt.Add(time.Minute))+time.Second-1)/time.Second))
		return &PhoneCodeCooldownError{Seconds: seconds}
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	// Do not reveal whether a phone belongs to an existing user. Registration
	// will return the definitive duplicate error after normal verification.
	if _, err := s.repo.UserByPhone(phone); err == nil {
		return nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	code, err := randomNumericCode(6)
	if err != nil {
		return err
	}
	codeHash, err := s.phoneVerificationCodeHash(registrationPhonePurpose, phone, code)
	if err != nil {
		return err
	}
	now := time.Now()
	record := model.PhoneVerificationCode{ID: kernel.NewID(), Phone: phone, CodeHash: codeHash, Purpose: registrationPhonePurpose, ExpiresAt: now.Add(registrationCodeTTL), CreatedAt: now}
	if err := s.repo.Create(&record); err != nil {
		return err
	}
	if err := s.deliverSMS(setting, phone, code); err != nil {
		cleanupErr := s.repo.DeletePhoneVerificationCode(record.ID)
		if cleanupErr != nil {
			return errors.Join(fmt.Errorf("发送手机验证码失败：%w", err), fmt.Errorf("清理失效验证码失败：%w", cleanupErr))
		}
		return fmt.Errorf("发送手机验证码失败：%w", err)
	}
	if cleanupErr := s.repo.DeleteExpiredPhoneVerificationCodes(now.Add(-24 * time.Hour)); cleanupErr != nil {
		log.Printf("expired registration phone code cleanup failed: error=%v", cleanupErr)
	}
	return nil
}

func (s *Service) VerifyRegistrationPhoneCode(rawPhone string, rawCode string) (*model.PhoneVerificationCode, error) {
	phone := NormalizePhone(rawPhone)
	if err := ValidatePhone(phone); err != nil {
		return nil, err
	}
	smsEnabled, err := s.SMSEnabled()
	if err != nil {
		return nil, err
	}
	if !smsEnabled {
		return nil, kernel.Forbidden("平台尚未启用手机验证码验证，请联系管理员")
	}
	code := strings.TrimSpace(rawCode)
	if len(code) != 6 || !allDigits(code) {
		return nil, kernel.BadAuthRequest("请输入 6 位手机验证码")
	}
	record, err := s.repo.LatestPhoneVerificationCode(phone, registrationPhonePurpose)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, kernel.BadAuthRequest("请先获取手机验证码")
	}
	if err != nil {
		return nil, err
	}
	if record.Attempts >= maxPhoneCodeAttempts {
		return nil, kernel.BadAuthRequest("手机验证码错误次数过多，请重新获取")
	}
	if time.Now().After(record.ExpiresAt) {
		return nil, kernel.BadAuthRequest("手机验证码已过期，请重新获取")
	}
	hash, err := s.phoneVerificationCodeHash(registrationPhonePurpose, phone, code)
	if err != nil {
		return nil, err
	}
	if !hmac.Equal([]byte(hash), []byte(record.CodeHash)) {
		attempts, err := s.repo.RecordPhoneVerificationFailure(record.ID, time.Now(), maxPhoneCodeAttempts)
		if err != nil {
			return nil, err
		}
		if attempts < 0 || attempts >= maxPhoneCodeAttempts {
			return nil, kernel.BadAuthRequest("手机验证码错误次数过多，请重新获取")
		}
		return nil, kernel.BadAuthRequest("手机验证码不正确")
	}
	return record, nil
}

func (s *Service) phoneVerificationCodeHash(purpose string, phone string, code string) (string, error) {
	key, err := s.host.SettingsEncryptionKey()
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(strings.TrimSpace(purpose) + ":" + NormalizePhone(phone) + ":" + strings.TrimSpace(code)))
	return hex.EncodeToString(mac.Sum(nil)), nil
}

func (s *Service) readSMSSetting() (*model.SystemSetting, SMSSettingValue, error) {
	setting, err := s.repo.SystemSetting(smsSettingKey)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, normalizeSMSSetting(SMSSettingValue{}), nil
	}
	if err != nil {
		return nil, SMSSettingValue{}, err
	}
	value := SMSSettingValue{}
	if strings.TrimSpace(setting.ValueJSON) == "" || json.Unmarshal([]byte(setting.ValueJSON), &value) != nil {
		return nil, SMSSettingValue{}, errors.New("短信配置格式无效")
	}
	value.AccessKeySecret, err = s.host.DecryptSecret(value.AccessKeySecret)
	if err != nil {
		return nil, SMSSettingValue{}, err
	}
	value.APIKey, err = s.host.DecryptSecret(value.APIKey)
	if err != nil {
		return nil, SMSSettingValue{}, err
	}
	return setting, normalizeSMSSetting(value), nil
}

func normalizeSMSSetting(value SMSSettingValue) SMSSettingValue {
	value.Provider = strings.ToLower(strings.TrimSpace(value.Provider))
	if value.Provider == "" {
		value.Provider = smsProviderAliyun
	}
	value.AccessKeyID = strings.TrimSpace(value.AccessKeyID)
	value.AccessKeySecret = strings.TrimSpace(value.AccessKeySecret)
	value.SignName = strings.TrimSpace(value.SignName)
	value.TemplateCode = strings.TrimSpace(value.TemplateCode)
	value.Endpoint = strings.TrimSpace(value.Endpoint)
	value.APIKey = strings.TrimSpace(value.APIKey)
	if value.Provider == smsProviderAliyun && value.Endpoint == "" {
		value.Endpoint = aliyunSMSEndpoint
	}
	return value
}

func (s *Service) publicSMSSetting(setting *model.SystemSetting, value SMSSettingValue) *PublicSMSSetting {
	value = normalizeSMSSetting(value)
	result := &PublicSMSSetting{
		Enabled: value.Enabled, Configured: value.Enabled && smsSettingConfigured(value), Provider: value.Provider,
		AccessKeyID: value.AccessKeyID, HasAccessKeySecret: value.AccessKeySecret != "", SignName: value.SignName,
		TemplateCode: value.TemplateCode, Endpoint: value.Endpoint, HasAPIKey: value.APIKey != "",
	}
	if setting != nil {
		result.UpdatedBy = setting.UpdatedBy
		result.CreatedAt = setting.CreatedAt
		result.UpdatedAt = setting.UpdatedAt
	}
	return result
}

func smsSettingConfigured(value SMSSettingValue) bool {
	return validateSMSSetting(value) == nil
}

func validateSMSSetting(value SMSSettingValue) error {
	value = normalizeSMSSetting(value)
	switch value.Provider {
	case smsProviderAliyun:
		if value.AccessKeyID == "" || value.AccessKeySecret == "" || value.SignName == "" || value.TemplateCode == "" {
			if value.Enabled {
				return kernel.BadAuthRequest("启用阿里云短信前请完整填写 AccessKey、短信签名和模板编码")
			}
			return nil
		}
		if !validAliyunEndpoint(value.Endpoint) {
			return kernel.BadAuthRequest("阿里云短信地址必须使用 dysmsapi.aliyuncs.com 或 dysmsapi-vpc.aliyuncs.com 的 HTTPS 地址")
		}
	case smsProviderStandard:
		if value.Endpoint == "" || value.TemplateCode == "" {
			if value.Enabled {
				return kernel.BadAuthRequest("启用标准短信前请完整填写 HTTPS 接口地址和模板编码")
			}
			return nil
		}
		if !validSMSURL(value.Endpoint) {
			return kernel.BadAuthRequest("标准短信接口必须使用 HTTPS；本地回环地址可使用 HTTP")
		}
	default:
		return kernel.BadAuthRequest("不支持的短信服务商")
	}
	return nil
}

func validAliyunEndpoint(value string) bool {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return host == "dysmsapi.aliyuncs.com" || host == "dysmsapi-vpc.aliyuncs.com"
}

func validSMSURL(value string) bool {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return false
	}
	if parsed.Scheme == "https" {
		return true
	}
	return parsed.Scheme == "http" && isLoopbackHost(parsed.Hostname())
}

func isLoopbackHost(host string) bool {
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func phoneCodeRateLimitKey(phone string) string {
	sum := sha256.Sum256([]byte(NormalizePhone(phone)))
	return "registration-phone-code:" + hex.EncodeToString(sum[:])
}

func NormalizePhone(raw string) string {
	value := strings.NewReplacer(" ", "", "-", "", "(", "", ")", "").Replace(strings.TrimSpace(raw))
	if strings.HasPrefix(value, "+86") {
		value = value[3:]
	} else if strings.HasPrefix(value, "0086") {
		value = value[4:]
	} else if strings.HasPrefix(value, "86") && len(value) == 13 {
		value = value[2:]
	}
	if mainlandPhonePattern.MatchString(value) {
		return value
	}
	return ""
}

func ValidatePhone(value string) error {
	if NormalizePhone(value) == "" {
		return kernel.BadAuthRequest("请输入有效的中国大陆手机号")
	}
	return nil
}

func allDigits(value string) bool {
	for _, char := range value {
		if char < '0' || char > '9' {
			return false
		}
	}
	return true
}

func (s *Service) deliverSMS(setting SMSSettingValue, phone string, code string) error {
	if s.smsSender != nil {
		return s.smsSender(setting, phone, code)
	}
	switch normalizeSMSSetting(setting).Provider {
	case smsProviderAliyun:
		return sendAliyunSMS(setting, phone, code)
	case smsProviderStandard:
		return sendStandardSMS(setting, phone, code)
	default:
		return errors.New("不支持的短信服务商")
	}
}

func sendStandardSMS(setting SMSSettingValue, phone string, code string) error {
	client, err := smsHTTPClient(setting.Endpoint)
	if err != nil {
		return err
	}
	payload, err := json.Marshal(map[string]string{"phone": phone, "code": code, "signName": setting.SignName, "templateCode": setting.TemplateCode})
	if err != nil {
		return err
	}
	request, err := http.NewRequest(http.MethodPost, setting.Endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	if setting.APIKey != "" {
		request.Header.Set("Authorization", "Bearer "+setting.APIKey)
	}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 1024))
		return fmt.Errorf("标准短信接口返回 HTTP %d", response.StatusCode)
	}
	return validateStandardSMSResponse(response.Body)
}

func rejectHTTPRedirect(_ *http.Request, _ []*http.Request) error {
	return http.ErrUseLastResponse
}

// validateStandardSMSResponse accepts an empty response for status-only
// gateways, otherwise it requires an explicit success marker or success code.
func validateStandardSMSResponse(body io.Reader) error {
	data, err := io.ReadAll(io.LimitReader(body, 1<<20))
	if err != nil {
		return err
	}
	data = bytes.TrimSpace(data)
	if len(data) == 0 {
		return nil
	}
	var response struct {
		Success *bool           `json:"success"`
		OK      *bool           `json:"ok"`
		Code    json.RawMessage `json:"code"`
	}
	if err := json.Unmarshal(data, &response); err != nil {
		return errors.New("标准短信响应格式无效")
	}
	if response.Success != nil && !*response.Success {
		return errors.New("标准短信接口报告发送失败")
	}
	if response.OK != nil && !*response.OK {
		return errors.New("标准短信接口报告发送失败")
	}
	if len(response.Code) == 0 {
		if response.Success != nil || response.OK != nil {
			return nil
		}
		return errors.New("标准短信响应缺少 success、ok 或 code 字段")
	}
	var numericCode int
	if json.Unmarshal(response.Code, &numericCode) == nil {
		if numericCode != 0 && numericCode != http.StatusOK {
			return fmt.Errorf("标准短信接口报告失败代码 %d", numericCode)
		}
		return nil
	}
	var stringCode string
	if json.Unmarshal(response.Code, &stringCode) == nil {
		switch strings.ToLower(strings.TrimSpace(stringCode)) {
		case "0", "200", "ok", "success", "succeed", "00000":
			return nil
		default:
			return fmt.Errorf("标准短信接口报告失败代码 %q", stringCode)
		}
	}
	return errors.New("标准短信响应 code 字段无效")
}

func sendAliyunSMS(setting SMSSettingValue, phone string, code string) error {
	setting = normalizeSMSSetting(setting)
	client, err := smsHTTPClient(setting.Endpoint)
	if err != nil {
		return err
	}
	params := map[string]string{
		"AccessKeyId":      setting.AccessKeyID,
		"Action":           "SendSms",
		"Format":           "JSON",
		"PhoneNumbers":     phone,
		"RegionId":         "cn-hangzhou",
		"SignName":         setting.SignName,
		"SignatureMethod":  "HMAC-SHA1",
		"SignatureNonce":   kernel.NewID(),
		"SignatureVersion": "1.0",
		"TemplateCode":     setting.TemplateCode,
		"TemplateParam":    fmt.Sprintf(`{"code":"%s"}`, code),
		"Timestamp":        time.Now().UTC().Format("2006-01-02T15:04:05Z"),
		"Version":          "2017-05-25",
	}
	params["Signature"] = aliyunSignature(params, setting.AccessKeySecret)
	form := url.Values{}
	for key, value := range params {
		form.Set(key, value)
	}
	request, err := http.NewRequest(http.MethodPost, setting.Endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return err
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("阿里云短信接口返回 HTTP %d", response.StatusCode)
	}
	var result struct {
		Code    string `json:"Code"`
		Message string `json:"Message"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return errors.New("阿里云短信响应格式无效")
	}
	if result.Code != "OK" {
		if result.Message == "" {
			result.Message = "未知错误"
		}
		return fmt.Errorf("阿里云短信发送失败：%s", result.Message)
	}
	return nil
}

func smsHTTPClient(endpoint string) (*http.Client, error) {
	parsed, err := url.Parse(strings.TrimSpace(endpoint))
	if err != nil {
		return nil, err
	}
	if parsed.Scheme == "http" && isLoopbackHost(parsed.Hostname()) {
		return &http.Client{Timeout: 12 * time.Second, CheckRedirect: rejectHTTPRedirect}, nil
	}
	if _, err := outbound.ValidateOutboundURL(endpoint); err != nil {
		return nil, err
	}
	client := outbound.OutboundHTTPClient(12 * time.Second)
	client.CheckRedirect = rejectHTTPRedirect
	return client, nil
}

func aliyunSignature(params map[string]string, secret string) string {
	canonicalQuery := aliyunCanonicalQuery(params)
	stringToSign := "POST&%2F&" + aliyunPercentEncode(canonicalQuery)
	mac := hmac.New(sha1.New, []byte(secret+"&"))
	_, _ = mac.Write([]byte(stringToSign))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

func aliyunCanonicalQuery(params map[string]string) string {
	keys := make([]string, 0, len(params))
	for key := range params {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, aliyunPercentEncode(key)+"="+aliyunPercentEncode(params[key]))
	}
	return strings.Join(parts, "&")
}

func aliyunPercentEncode(value string) string {
	encoded := url.QueryEscape(value)
	encoded = strings.ReplaceAll(encoded, "+", "%20")
	encoded = strings.ReplaceAll(encoded, "%7E", "~")
	return encoded
}
