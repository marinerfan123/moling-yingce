package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/kernel"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestNormalizePhoneAcceptsMainlandFormats(t *testing.T) {
	for _, input := range []string{"13800138000", "+8613800138000", "0086 138-0013-8000", "86 13800138000"} {
		if got := NormalizePhone(input); got != "13800138000" {
			t.Fatalf("NormalizePhone(%q) = %q", input, got)
		}
	}
	for _, input := range []string{"1380013800", "12800138000", "13800138000x", ""} {
		if got := NormalizePhone(input); got != "" {
			t.Fatalf("NormalizePhone(%q) = %q, want empty", input, got)
		}
	}
}

func TestSMSSettingRoundTripKeepsOnlySecretFlagsPublic(t *testing.T) {
	svc, _ := newSMSRegistrationTestService(t)
	server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {}))
	defer server.Close()
	admin := &model.User{ID: "admin", Username: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	setting, err := svc.UpdateSMSSetting(admin, SMSSettingRequest{Enabled: true, Provider: smsProviderStandard, Endpoint: server.URL, TemplateCode: "register-code", APIKey: "secret-api-key"})
	if err != nil {
		t.Fatal(err)
	}
	if !setting.Enabled || !setting.Configured || !setting.HasAPIKey {
		t.Fatalf("public SMS setting leaked or lost API key: %#v", setting)
	}
	stored, err := svc.repo.SystemSetting(smsSettingKey)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(stored.ValueJSON, "secret-api-key") {
		t.Fatal("test host encryption should retain the configured secret for this unit test")
	}
	read, err := svc.AdminSMSSetting(admin)
	if err != nil || !read.HasAPIKey {
		t.Fatalf("SMS setting did not round-trip: setting=%#v err=%v", read, err)
	}
}

func TestStandardSMSUsesJSONContractAndBearerAPIKey(t *testing.T) {
	var gotBody map[string]string
	var gotAuthorization string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuthorization = r.Header.Get("Authorization")
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Errorf("decode body: %v", err)
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()
	if err := sendStandardSMS(SMSSettingValue{Endpoint: server.URL, APIKey: "api-key", SignName: "墨灵AI", TemplateCode: "SMS_REGISTER"}, "13800138000", "123456"); err != nil {
		t.Fatal(err)
	}
	if gotAuthorization != "Bearer api-key" || gotBody["phone"] != "13800138000" || gotBody["code"] != "123456" || gotBody["signName"] != "墨灵AI" || gotBody["templateCode"] != "SMS_REGISTER" {
		t.Fatalf("unexpected standard SMS request: authorization=%q body=%#v", gotAuthorization, gotBody)
	}
}

func TestStandardSMSRejectsBusinessFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":false}`))
	}))
	defer server.Close()
	if err := sendStandardSMS(SMSSettingValue{Endpoint: server.URL, TemplateCode: "register-code"}, "13800138000", "123456"); err == nil {
		t.Fatal("a business failure response should not be treated as delivery success")
	}
}

func TestStandardSMSRejectsRedirect(t *testing.T) {
	reached := false
	destination := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		reached = true
	}))
	defer destination.Close()
	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Location", destination.URL)
		w.WriteHeader(http.StatusFound)
	}))
	defer redirect.Close()
	if err := sendStandardSMS(SMSSettingValue{Endpoint: redirect.URL, TemplateCode: "register-code"}, "13800138000", "123456"); err == nil {
		t.Fatal("a redirect should not be treated as delivery success")
	}
	if reached {
		t.Fatal("the SMS payload followed a redirect")
	}
}

func TestStandardSMSRejectsPrivateHTTPS(t *testing.T) {
	if err := sendStandardSMS(SMSSettingValue{Endpoint: "https://127.0.0.1:8443/send", TemplateCode: "register-code"}, "13800138000", "123456"); err == nil {
		t.Fatal("a private HTTPS SMS endpoint should be rejected")
	}
}

func TestAliyunSignatureIsStableForSameParameters(t *testing.T) {
	params := map[string]string{"Action": "SendSms", "PhoneNumbers": "13800138000", "SignName": "墨灵AI"}
	first := aliyunSignature(params, "access-key-secret")
	second := aliyunSignature(params, "access-key-secret")
	if first == "" || first != second {
		t.Fatalf("aliyun signature is not stable: first=%q second=%q", first, second)
	}
	if aliyunCanonicalQuery(params) != "Action=SendSms&PhoneNumbers=13800138000&SignName=%E5%A2%A8%E7%81%B5AI" {
		t.Fatalf("unexpected canonical query: %s", aliyunCanonicalQuery(params))
	}
}

func TestRegistrationRequiresAndConsumesEmailAndPhoneCodes(t *testing.T) {
	svc, db := newSMSRegistrationTestService(t)
	admin := &model.User{ID: "admin", Username: "admin", Email: "admin@example.com", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	if err := db.Create(admin).Error; err != nil {
		t.Fatal(err)
	}
	var emailCode, phoneCode string
	svc.SetMailSender(func(_ EmailSettingValue, _, _ string, body string) error {
		emailCode = codeFromEmailBody(body)
		return nil
	})
	svc.SetSMSSender(func(_ SMSSettingValue, _, code string) error {
		phoneCode = code
		return nil
	})
	if _, err := svc.UpdateSMSSetting(admin, SMSSettingRequest{Enabled: true, Provider: smsProviderStandard, Endpoint: "http://127.0.0.1:1/send", TemplateCode: "register-code"}); err != nil {
		t.Fatal(err)
	}
	if err := svc.SendRegistrationEmailCode("member@example.com"); err != nil {
		t.Fatal(err)
	}
	if err := svc.SendRegistrationPhoneCode("+86 13800138000"); err != nil {
		t.Fatal(err)
	}
	if len(emailCode) != 6 || len(phoneCode) != 6 {
		t.Fatalf("codes were not delivered: email=%q phone=%q", emailCode, phoneCode)
	}
	result, err := svc.Register(RegisterRequest{Username: "member", Email: "member@example.com", EmailCode: emailCode, Phone: "+8613800138000", PhoneCode: phoneCode, Password: "strong-password"})
	if err != nil {
		t.Fatal(err)
	}
	if result.User.Phone != "13800138000" {
		t.Fatalf("registered phone = %q", result.User.Phone)
	}
	var stored model.User
	if err := db.First(&stored, "username = ?", "member").Error; err != nil {
		t.Fatal(err)
	}
	if stored.Phone != "13800138000" {
		t.Fatalf("stored phone = %q", stored.Phone)
	}
	var usedEmail, usedPhone int64
	if err := db.Model(&model.EmailVerificationCode{}).Where("used_at IS NOT NULL").Count(&usedEmail).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.PhoneVerificationCode{}).Where("used_at IS NOT NULL").Count(&usedPhone).Error; err != nil {
		t.Fatal(err)
	}
	if usedEmail != 1 || usedPhone != 1 {
		t.Fatalf("verification usage = email:%d phone:%d", usedEmail, usedPhone)
	}
	if _, err := svc.VerifyRegistrationPhoneCode("13800138000", phoneCode); err == nil {
		t.Fatal("a consumed phone verification code should not be reusable")
	}
}

func TestRegistrationPhoneCodeRejectsWrongAndExpiredCodes(t *testing.T) {
	svc, db := newSMSRegistrationTestService(t)
	admin := &model.User{ID: "admin", Username: "admin", Email: "admin@example.com", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	if err := db.Create(admin).Error; err != nil {
		t.Fatal(err)
	}
	var sentCode string
	if _, err := svc.UpdateSMSSetting(admin, SMSSettingRequest{Enabled: true, Provider: smsProviderStandard, Endpoint: "http://127.0.0.1:1/send", TemplateCode: "register-code"}); err != nil {
		t.Fatal(err)
	}
	svc.SetSMSSender(func(_ SMSSettingValue, _, code string) error {
		sentCode = code
		return nil
	})
	if err := svc.SendRegistrationPhoneCode("13800138000"); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.VerifyRegistrationPhoneCode("13800138000", "000000"); err == nil {
		t.Fatal("an incorrect phone verification code should be rejected")
	}
	if sentCode == "" {
		t.Fatal("test SMS sender did not receive a code")
	}
	if err := db.Model(&model.PhoneVerificationCode{}).Where("phone = ?", "13800138000").Update("expires_at", time.Now().Add(-time.Minute)).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.VerifyRegistrationPhoneCode("13800138000", sentCode); err == nil {
		t.Fatal("an expired phone verification code should be rejected")
	}
}

func TestRegistrationPhoneDeliveryFailureDeletesCode(t *testing.T) {
	svc, db := newSMSRegistrationTestService(t)
	admin := &model.User{ID: "admin", Username: "admin", Email: "admin@example.com", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	if err := db.Create(admin).Error; err != nil {
		t.Fatal(err)
	}
	svc.SetSMSSender(func(SMSSettingValue, string, string) error { return errors.New("gateway unavailable") })
	if _, err := svc.UpdateSMSSetting(admin, SMSSettingRequest{Enabled: true, Provider: smsProviderStandard, Endpoint: "http://127.0.0.1:1/send", TemplateCode: "register-code"}); err != nil {
		t.Fatal(err)
	}
	if err := svc.SendRegistrationPhoneCode("13800138000"); err == nil {
		t.Fatal("delivery failure should be returned")
	}
	var count int64
	if err := db.Model(&model.PhoneVerificationCode{}).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("phone verification records = %d, want 0", count)
	}
}

func TestPhoneCodeCooldownIsReturnedBeforeSendingAgain(t *testing.T) {
	svc, db := newSMSRegistrationTestService(t)
	admin := &model.User{ID: "admin", Username: "admin", Email: "admin@example.com", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	if err := db.Create(admin).Error; err != nil {
		t.Fatal(err)
	}
	sends := 0
	svc.SetSMSSender(func(SMSSettingValue, string, string) error { sends++; return nil })
	if _, err := svc.UpdateSMSSetting(admin, SMSSettingRequest{Enabled: true, Provider: smsProviderStandard, Endpoint: "http://127.0.0.1:1/send", TemplateCode: "register-code"}); err != nil {
		t.Fatal(err)
	}
	if err := svc.SendRegistrationPhoneCode("13800138000"); err != nil {
		t.Fatal(err)
	}
	err := svc.SendRegistrationPhoneCode("13800138000")
	var cooldown *PhoneCodeCooldownError
	if !errors.As(err, &cooldown) || cooldown.Seconds < 1 || sends != 1 {
		t.Fatalf("cooldown error=%v sends=%d", err, sends)
	}
}

func TestPhoneCodeDoesNotRevealRegisteredPhoneWhenSMSIsDisabled(t *testing.T) {
	svc, db := newSMSRegistrationTestService(t)
	admin := &model.User{ID: "admin", Username: "admin", Email: "admin@example.com", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	registered := &model.User{ID: "member", Username: "member", Email: "member@example.com", Phone: "13800138000", Role: model.UserRoleUser, Status: model.UserStatusActive}
	if err := db.Create(admin).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(registered).Error; err != nil {
		t.Fatal(err)
	}
	err := svc.SendRegistrationPhoneCode("13800138000")
	if err == nil || strings.Contains(err.Error(), "手机号已被注册") || !strings.Contains(err.Error(), "尚未启用手机验证码") {
		t.Fatalf("registered phone leaked through disabled SMS response: %v", err)
	}
}

func TestPhoneCodeDoesNotRevealRegisteredPhoneThroughCooldown(t *testing.T) {
	svc, db := newSMSRegistrationTestService(t)
	svc.host = &smsRateLimitHost{}
	admin := &model.User{ID: "admin", Username: "admin", Email: "admin@example.com", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	registered := &model.User{ID: "member", Username: "member", Email: "member@example.com", Phone: "13800138000", Role: model.UserRoleUser, Status: model.UserStatusActive}
	if err := db.Create(admin).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(registered).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.UpdateSMSSetting(admin, SMSSettingRequest{Enabled: true, Provider: smsProviderStandard, Endpoint: "http://127.0.0.1:1/send", TemplateCode: "register-code"}); err != nil {
		t.Fatal(err)
	}
	if err := svc.SendRegistrationPhoneCode("13800138000"); err != nil {
		t.Fatalf("first registered-phone request = %v", err)
	}
	err := svc.SendRegistrationPhoneCode("13800138000")
	var cooldown *PhoneCodeCooldownError
	if !errors.As(err, &cooldown) {
		t.Fatalf("second registered-phone request = %v, want cooldown", err)
	}
}

func TestPhoneCodeLocksAfterTooManyFailedAttempts(t *testing.T) {
	svc, _ := newSMSRegistrationTestService(t)
	admin := &model.User{ID: "admin", Username: "admin", Email: "admin@example.com", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	if err := svc.repo.Create(admin); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.UpdateSMSSetting(admin, SMSSettingRequest{Enabled: true, Provider: smsProviderStandard, Endpoint: "http://127.0.0.1:1/send", TemplateCode: "register-code"}); err != nil {
		t.Fatal(err)
	}
	svc.SetSMSSender(func(SMSSettingValue, string, string) error { return nil })
	if err := svc.SendRegistrationPhoneCode("13800138000"); err != nil {
		t.Fatal(err)
	}
	for attempt := 1; attempt <= maxPhoneCodeAttempts; attempt++ {
		_, err := svc.VerifyRegistrationPhoneCode("13800138000", "000000")
		if err == nil {
			t.Fatal("an incorrect code was accepted")
		}
		if attempt < maxPhoneCodeAttempts && strings.Contains(err.Error(), "错误次数过多") {
			t.Fatalf("attempt %d locked the challenge too early: %v", attempt, err)
		}
	}
	if _, err := svc.VerifyRegistrationPhoneCode("13800138000", "000000"); err == nil || !strings.Contains(err.Error(), "错误次数过多") {
		t.Fatalf("locked challenge returned %v", err)
	}
}

func TestSMSSettingPatchPreservesOmittedFields(t *testing.T) {
	svc, _ := newSMSRegistrationTestService(t)
	admin := &model.User{ID: "admin", Username: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	if err := svc.repo.Create(admin); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.UpdateSMSSetting(admin, SMSSettingRequest{Enabled: true, Provider: smsProviderStandard, Endpoint: "http://127.0.0.1:1/send", TemplateCode: "register-code", APIKey: "api-key", SignName: "墨灵AI"}); err != nil {
		t.Fatal(err)
	}
	var patch SMSSettingRequest
	if err := json.Unmarshal([]byte(`{"enabled":false}`), &patch); err != nil {
		t.Fatal(err)
	}
	setting, err := svc.UpdateSMSSetting(admin, patch)
	if err != nil {
		t.Fatal(err)
	}
	if setting.Enabled || setting.Provider != smsProviderStandard || setting.Endpoint != "http://127.0.0.1:1/send" || setting.TemplateCode != "register-code" || !setting.HasAPIKey {
		t.Fatalf("PATCH discarded omitted fields: %#v", setting)
	}
}

func newSMSRegistrationTestService(t *testing.T) (*Service, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+kernel.NewID()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.User{}, &model.UserIdentity{}, &model.AuthSession{}, &model.EmailVerificationCode{}, &model.PhoneVerificationCode{}, &model.SystemSetting{}); err != nil {
		t.Fatal(err)
	}
	settingJSON, err := json.Marshal(EmailSettingValue{Enabled: true, Host: "smtp.example.com", Port: 587, Encryption: "starttls", FromEmail: "noreply@example.com", FromName: "影策", RegistrationAllowedDomains: []string{"example.com"}})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.SystemSetting{Key: emailSettingKey, ValueJSON: string(settingJSON)}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.SystemSetting{Key: registrationSettingKey, ValueJSON: `{"enabled":true}`}).Error; err != nil {
		t.Fatal(err)
	}
	return New(repository.New(db), nil, nil), db
}

type smsRateLimitHost struct {
	nopHost
	requests int
}

func (h *smsRateLimitHost) AllowRequest(context.Context, string, int, time.Duration) (bool, error) {
	h.requests++
	return h.requests == 1, nil
}

func (h *smsRateLimitHost) RequestRetryAfter(context.Context, string, time.Duration) time.Duration {
	return time.Minute
}
