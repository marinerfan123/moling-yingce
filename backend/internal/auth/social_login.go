package auth

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"infinite-canvas/backend/internal/kernel"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/outbound"

	"gorm.io/gorm"
)

const (
	wechatSettingKey = "wechat_oauth"
	douyinSettingKey = "douyin_oauth"
)

// SocialLoginSettingRequest is shared by the two providers. Their upstream
// APIs use different parameter names, but the admin contract stays stable.
type SocialLoginSettingRequest struct {
	Enabled          bool     `json:"enabled"`
	ClientID         string   `json:"clientId"`
	ClientSecret     string   `json:"clientSecret"`
	AuthorizationURL string   `json:"authorizationUrl"`
	TokenURL         string   `json:"tokenUrl"`
	UserInfoURL      string   `json:"userInfoUrl"`
	RedirectURL      string   `json:"redirectUrl"`
	Scopes           []string `json:"scopes"`
}

type PublicSocialLoginSetting struct {
	Enabled          bool      `json:"enabled"`
	ClientID         string    `json:"clientId"`
	HasClientSecret  bool      `json:"hasClientSecret"`
	AuthorizationURL string    `json:"authorizationUrl"`
	TokenURL         string    `json:"tokenUrl"`
	UserInfoURL      string    `json:"userInfoUrl"`
	RedirectURL      string    `json:"redirectUrl"`
	Scopes           []string  `json:"scopes"`
	UpdatedBy        string    `json:"updatedBy"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

type WeChatSettingRequest = SocialLoginSettingRequest
type PublicWeChatSetting = PublicSocialLoginSetting
type DouyinSettingRequest = SocialLoginSettingRequest
type PublicDouyinSetting = PublicSocialLoginSetting

type SocialLoginCallbackResult struct {
	Session *AuthSessionResult
	Next    string
}

type socialLoginProviderSpec struct {
	id               string
	settingKey       string
	displayName      string
	authorizationURL string
	tokenURL         string
	userInfoURL      string
	redirectURL      string
	scopes           []string
}

type socialLoginSettingValue struct {
	Enabled          bool     `json:"enabled"`
	ClientID         string   `json:"clientId"`
	ClientSecret     string   `json:"clientSecret"`
	AuthorizationURL string   `json:"authorizationUrl"`
	TokenURL         string   `json:"tokenUrl"`
	UserInfoURL      string   `json:"userInfoUrl"`
	RedirectURL      string   `json:"redirectUrl"`
	Scopes           []string `json:"scopes"`
}

func socialLoginSpec(provider string) (socialLoginProviderSpec, error) {
	switch provider {
	case "wechat":
		return socialLoginProviderSpec{
			id: "wechat", settingKey: wechatSettingKey, displayName: "微信",
			authorizationURL: "https://open.weixin.qq.com/connect/qrconnect",
			tokenURL:         "https://api.weixin.qq.com/sns/oauth2/access_token",
			userInfoURL:      "https://api.weixin.qq.com/sns/userinfo",
			redirectURL:      "http://localhost:3000/oauth/wechat/callback", scopes: []string{"snsapi_login"},
		}, nil
	case "douyin":
		return socialLoginProviderSpec{
			id: "douyin", settingKey: douyinSettingKey, displayName: "抖音",
			authorizationURL: "https://open.douyin.com/platform/oauth/connect/",
			tokenURL:         "https://open.douyin.com/oauth/access_token/",
			userInfoURL:      "https://open.douyin.com/oauth/userinfo/",
			redirectURL:      "http://localhost:3000/oauth/douyin/callback", scopes: []string{"user_info"},
		}, nil
	default:
		return socialLoginProviderSpec{}, kernel.BadAuthRequest("不支持的第三方登录提供商")
	}
}

func (s *Service) AdminWeChatSetting(actor *model.User) (*PublicWeChatSetting, error) {
	return s.adminSocialLoginSetting(actor, "wechat")
}

func (s *Service) UpdateWeChatSetting(actor *model.User, req WeChatSettingRequest) (*PublicWeChatSetting, error) {
	return s.updateSocialLoginSetting(actor, "wechat", req)
}

func (s *Service) WeChatEnabled() bool {
	return s.socialLoginEnabled("wechat")
}

func (s *Service) AdminDouyinSetting(actor *model.User) (*PublicDouyinSetting, error) {
	return s.adminSocialLoginSetting(actor, "douyin")
}

func (s *Service) UpdateDouyinSetting(actor *model.User, req DouyinSettingRequest) (*PublicDouyinSetting, error) {
	return s.updateSocialLoginSetting(actor, "douyin", req)
}

func (s *Service) DouyinEnabled() bool {
	return s.socialLoginEnabled("douyin")
}

func (s *Service) BeginSocialLogin(provider string, nextPath string) (string, error) {
	spec, err := socialLoginSpec(provider)
	if err != nil {
		return "", err
	}
	count, err := s.repo.UserCount()
	if err != nil {
		return "", err
	}
	if count == 0 {
		return "", kernel.Forbidden("请先创建本地管理员账号，再开放第三方登录")
	}
	_, setting, err := s.readSocialLoginSetting(provider)
	if err != nil {
		return "", err
	}
	if !setting.Enabled {
		return "", kernel.Forbidden(spec.displayName + "登录尚未启用")
	}
	state := RandomToken()
	if err := s.repo.CreateOAuthState(&model.OAuthState{
		ID: kernel.NewID(), Provider: spec.id, StateHash: HashToken(state), CodeVerifier: RandomToken(),
		NextPath: safeOAuthNext(nextPath), ExpiresAt: time.Now().Add(10 * time.Minute),
	}); err != nil {
		return "", err
	}
	authorizeURL, err := url.Parse(setting.AuthorizationURL)
	if err != nil {
		return "", err
	}
	query := authorizeURL.Query()
	if provider == "wechat" {
		query.Set("appid", setting.ClientID)
	} else {
		query.Set("client_key", setting.ClientID)
	}
	query.Set("redirect_uri", setting.RedirectURL)
	query.Set("response_type", "code")
	if len(setting.Scopes) > 0 {
		query.Set("scope", strings.Join(setting.Scopes, ","))
	}
	query.Set("state", state)
	authorizeURL.RawQuery = query.Encode()
	if provider == "wechat" && authorizeURL.Fragment == "" {
		authorizeURL.Fragment = "wechat_redirect"
	}
	return authorizeURL.String(), nil
}

func (s *Service) CompleteSocialLogin(provider string, stateValue string, code string) (*SocialLoginCallbackResult, error) {
	spec, err := socialLoginSpec(provider)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(stateValue) == "" || strings.TrimSpace(code) == "" {
		return nil, kernel.BadAuthRequest(spec.displayName + "登录回调缺少必要参数")
	}
	state, err := s.repo.ConsumeOAuthState(spec.id, HashToken(stateValue))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, kernel.BadAuthRequest(spec.displayName + "登录状态无效或已过期")
	}
	if err != nil {
		return nil, err
	}
	_, setting, err := s.readSocialLoginSetting(provider)
	if err != nil {
		return nil, err
	}
	token, err := exchangeSocialLoginCode(spec, setting, code)
	if err != nil {
		return nil, err
	}
	profile, err := fetchSocialLoginProfile(spec, setting, token)
	if err != nil {
		return nil, err
	}
	subject, providerUsername, displayName, email, avatarURL := socialProfileValues(spec.id, token, profile)
	if subject == "" {
		return nil, errors.New(spec.displayName + "用户信息缺少稳定用户 ID")
	}
	identity, err := s.repo.UserIdentity(spec.id, subject)
	var user *model.User
	if err == nil {
		user, err = s.repo.User(identity.UserID)
		if err != nil {
			return nil, err
		}
		identity.ProviderUsername = providerUsername
		identity.AvatarURL = avatarURL
		identity.UpdatedAt = time.Now()
		if err := s.repo.Save(identity); err != nil {
			return nil, err
		}
	} else if errors.Is(err, gorm.ErrRecordNotFound) {
		registrationEnabled, settingErr := s.RegistrationEnabled()
		if settingErr != nil {
			return nil, settingErr
		}
		if !registrationEnabled {
			return nil, kernel.Forbidden("管理员未开放新用户注册")
		}
		user, identity, err = s.createSocialLoginUser(spec.id, subject, providerUsername, displayName, email, avatarURL)
		if err != nil {
			return nil, err
		}
		if err := s.repo.CreateOAuthUser(user, identity); err != nil {
			return nil, err
		}
	} else {
		return nil, err
	}
	if user.Status != model.UserStatusActive {
		return nil, kernel.Forbidden("该账号已被禁用")
	}
	if err := s.host.EnsureSignupBonus(user.ID); err != nil {
		return nil, err
	}
	now := time.Now()
	user.LastLoginAt = &now
	user.UpdatedAt = now
	if err := s.repo.Save(user); err != nil {
		return nil, err
	}
	s.host.RecordActivity(user.ID, "login", 1)
	session, err := s.createAuthSession(user)
	if err != nil {
		return nil, err
	}
	return &SocialLoginCallbackResult{Session: session, Next: safeOAuthNext(state.NextPath)}, nil
}

func (s *Service) adminSocialLoginSetting(actor *model.User, provider string) (*PublicSocialLoginSetting, error) {
	if err := s.host.RequireAdmin(actor); err != nil {
		return nil, err
	}
	setting, value, err := s.readSocialLoginSetting(provider)
	if err != nil {
		return nil, err
	}
	return publicSocialLoginSetting(setting, value), nil
}

func (s *Service) updateSocialLoginSetting(actor *model.User, provider string, req SocialLoginSettingRequest) (*PublicSocialLoginSetting, error) {
	if err := s.host.RequireAdmin(actor); err != nil {
		return nil, err
	}
	spec, err := socialLoginSpec(provider)
	if err != nil {
		return nil, err
	}
	currentSetting, current, err := s.readSocialLoginSetting(provider)
	if err != nil {
		return nil, err
	}
	next := normalizeSocialLoginSetting(socialLoginSettingValue{
		Enabled: req.Enabled, ClientID: req.ClientID, ClientSecret: req.ClientSecret,
		AuthorizationURL: req.AuthorizationURL, TokenURL: req.TokenURL, UserInfoURL: req.UserInfoURL,
		RedirectURL: req.RedirectURL, Scopes: req.Scopes,
	})
	if next.ClientSecret == "" {
		next.ClientSecret = current.ClientSecret
	}
	if err := validateSocialLoginSetting(spec, next); err != nil {
		return nil, err
	}
	stored := next
	stored.ClientSecret, err = s.host.EncryptSecret(next.ClientSecret)
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(stored)
	if err != nil {
		return nil, err
	}
	systemSetting := model.SystemSetting{Key: spec.settingKey, ValueJSON: string(encoded), UpdatedBy: actor.ID}
	if currentSetting != nil {
		systemSetting.CreatedAt = currentSetting.CreatedAt
	}
	if err := s.repo.SaveSystemSetting(&systemSetting); err != nil {
		return nil, err
	}
	return publicSocialLoginSetting(&systemSetting, next), nil
}

func (s *Service) socialLoginEnabled(provider string) bool {
	_, setting, err := s.readSocialLoginSetting(provider)
	return err == nil && setting.Enabled
}

func (s *Service) readSocialLoginSetting(provider string) (*model.SystemSetting, socialLoginSettingValue, error) {
	spec, err := socialLoginSpec(provider)
	if err != nil {
		return nil, socialLoginSettingValue{}, err
	}
	setting, err := s.repo.SystemSetting(spec.settingKey)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, defaultSocialLoginSetting(spec), nil
	}
	if err != nil {
		return nil, socialLoginSettingValue{}, err
	}
	value := defaultSocialLoginSetting(spec)
	if strings.TrimSpace(setting.ValueJSON) != "" {
		if err := json.Unmarshal([]byte(setting.ValueJSON), &value); err != nil {
			return nil, socialLoginSettingValue{}, errors.New(spec.displayName + "登录配置格式无效")
		}
	}
	value.ClientSecret, err = s.host.DecryptSecret(value.ClientSecret)
	if err != nil {
		return nil, socialLoginSettingValue{}, err
	}
	return setting, normalizeSocialLoginSetting(value), nil
}

func validateSocialLoginSetting(spec socialLoginProviderSpec, value socialLoginSettingValue) error {
	if !value.Enabled {
		return nil
	}
	if value.ClientID == "" || value.ClientSecret == "" || value.AuthorizationURL == "" || value.TokenURL == "" || value.UserInfoURL == "" || value.RedirectURL == "" {
		return kernel.BadAuthRequest("启用" + spec.displayName + "登录前请完整填写 App ID、Secret、端点和回调配置")
	}
	for _, rawURL := range []string{value.AuthorizationURL, value.TokenURL, value.UserInfoURL} {
		parsed, err := url.Parse(rawURL)
		if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
			return kernel.BadAuthRequest(spec.displayName + "授权、Token 和用户信息地址必须是有效的 HTTPS URL")
		}
	}
	redirectURL, err := url.Parse(value.RedirectURL)
	if err != nil || redirectURL.Host == "" || (redirectURL.Scheme != "https" && !(redirectURL.Scheme == "http" && isLoopbackOAuthHost(redirectURL.Hostname()))) {
		return kernel.BadAuthRequest(spec.displayName + "回调地址必须使用 HTTPS，本地回环地址可使用 HTTP")
	}
	return nil
}

func normalizeSocialLoginSetting(value socialLoginSettingValue) socialLoginSettingValue {
	value.ClientID = strings.TrimSpace(value.ClientID)
	value.ClientSecret = strings.TrimSpace(value.ClientSecret)
	value.AuthorizationURL = strings.TrimSpace(value.AuthorizationURL)
	value.TokenURL = strings.TrimSpace(value.TokenURL)
	value.UserInfoURL = strings.TrimSpace(value.UserInfoURL)
	value.RedirectURL = strings.TrimSpace(value.RedirectURL)
	value.Scopes = kernel.UniqueNonEmpty(value.Scopes)
	return value
}

func defaultSocialLoginSetting(spec socialLoginProviderSpec) socialLoginSettingValue {
	return normalizeSocialLoginSetting(socialLoginSettingValue{
		AuthorizationURL: spec.authorizationURL, TokenURL: spec.tokenURL, UserInfoURL: spec.userInfoURL,
		RedirectURL: spec.redirectURL, Scopes: append([]string(nil), spec.scopes...),
	})
}

func publicSocialLoginSetting(setting *model.SystemSetting, value socialLoginSettingValue) *PublicSocialLoginSetting {
	result := &PublicSocialLoginSetting{
		Enabled: value.Enabled, ClientID: value.ClientID, HasClientSecret: value.ClientSecret != "",
		AuthorizationURL: value.AuthorizationURL, TokenURL: value.TokenURL, UserInfoURL: value.UserInfoURL,
		RedirectURL: value.RedirectURL, Scopes: value.Scopes,
	}
	if setting != nil {
		result.UpdatedBy = setting.UpdatedBy
		result.CreatedAt = setting.CreatedAt
		result.UpdatedAt = setting.UpdatedAt
	}
	return result
}

type socialLoginToken struct {
	AccessToken     string
	UserInfoSubject string
	IdentitySubject string
}

func exchangeSocialLoginCode(spec socialLoginProviderSpec, setting socialLoginSettingValue, code string) (socialLoginToken, error) {
	parsed, err := outbound.ValidateOutboundURL(setting.TokenURL)
	if err != nil {
		return socialLoginToken{}, err
	}
	var response map[string]any
	if spec.id == "wechat" {
		query := parsed.Query()
		query.Set("appid", setting.ClientID)
		query.Set("secret", setting.ClientSecret)
		query.Set("code", code)
		query.Set("grant_type", "authorization_code")
		parsed.RawQuery = query.Encode()
		response, err = requestSocialJSON(http.MethodGet, parsed.String(), "", nil)
	} else {
		form := url.Values{"client_key": {setting.ClientID}, "client_secret": {setting.ClientSecret}, "code": {code}, "grant_type": {"authorization_code"}}
		response, err = requestSocialJSON(http.MethodPost, parsed.String(), form.Encode(), map[string]string{"Content-Type": "application/x-www-form-urlencoded"})
	}
	if err != nil {
		return socialLoginToken{}, fmt.Errorf("%s Token 请求失败：%w", spec.displayName, err)
	}
	accessToken := firstNonEmpty(profileString(response, "access_token"), profileString(response, "data.access_token"))
	if accessToken == "" {
		message := firstNonEmpty(profileString(response, "errmsg"), profileString(response, "description"), profileString(response, "message"))
		if message == "" {
			message = "响应无效"
		}
		return socialLoginToken{}, fmt.Errorf("%s Token 响应无效：%s", spec.displayName, message)
	}
	if spec.id == "wechat" {
		openid := firstNonEmpty(profileString(response, "openid"), profileString(response, "unionid"))
		identitySubject := firstNonEmpty(profileString(response, "unionid"), openid)
		return socialLoginToken{AccessToken: accessToken, UserInfoSubject: openid, IdentitySubject: identitySubject}, nil
	}
	openid := firstNonEmpty(profileString(response, "data.open_id"), profileString(response, "open_id"))
	return socialLoginToken{AccessToken: accessToken, UserInfoSubject: openid, IdentitySubject: openid}, nil
}

func fetchSocialLoginProfile(spec socialLoginProviderSpec, setting socialLoginSettingValue, token socialLoginToken) (map[string]any, error) {
	parsed, err := outbound.ValidateOutboundURL(setting.UserInfoURL)
	if err != nil {
		return nil, err
	}
	query := parsed.Query()
	query.Set("access_token", token.AccessToken)
	if token.UserInfoSubject != "" {
		if spec.id == "wechat" {
			query.Set("openid", token.UserInfoSubject)
			query.Set("lang", "zh_CN")
		} else {
			query.Set("open_id", token.UserInfoSubject)
		}
	}
	parsed.RawQuery = query.Encode()
	profile, err := requestSocialJSON(http.MethodGet, parsed.String(), "", nil)
	if err != nil {
		return nil, fmt.Errorf("%s 用户信息请求失败：%w", spec.displayName, err)
	}
	if message := firstNonEmpty(profileString(profile, "errmsg"), profileString(profile, "description"), profileString(profile, "message")); message != "" && profileString(profile, "openid") == "" && profileString(profile, "data.open_id") == "" {
		return nil, fmt.Errorf("%s 用户信息响应无效：%s", spec.displayName, message)
	}
	return profile, nil
}

func requestSocialJSON(method string, rawURL string, body string, headers map[string]string) (map[string]any, error) {
	requestBody := io.Reader(nil)
	if body != "" {
		requestBody = strings.NewReader(body)
	}
	req, err := http.NewRequest(method, rawURL, requestBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	outbound.ApplyDefaultOutboundHeaders(req)
	resp, err := outbound.OutboundHTTPClient(20 * time.Second).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	decoder := json.NewDecoder(bytes.NewReader(bodyBytes))
	decoder.UseNumber()
	var payload map[string]any
	if err := decoder.Decode(&payload); err != nil {
		return nil, errors.New("JSON 响应无效")
	}
	return payload, nil
}

func socialProfileValues(provider string, token socialLoginToken, profile map[string]any) (subject string, username string, displayName string, email string, avatarURL string) {
	if provider == "wechat" {
		subject = firstNonEmpty(profileString(profile, "unionid"), token.IdentitySubject, profileString(profile, "openid"))
		username = profileString(profile, "nickname")
		displayName = firstNonEmpty(username, "微信用户")
		avatarURL = profileString(profile, "headimgurl")
		return subject, username, displayName, "", avatarURL
	}
	subject = firstNonEmpty(profileString(profile, "data.union_id"), profileString(profile, "data.open_id"), token.IdentitySubject)
	username = profileString(profile, "data.display_name")
	displayName = firstNonEmpty(username, "抖音用户")
	avatarURL = profileString(profile, "data.avatar")
	return subject, username, displayName, "", avatarURL
}

func (s *Service) createSocialLoginUser(provider string, subject string, providerUsername string, displayName string, email string, avatarURL string) (*model.User, *model.UserIdentity, error) {
	base := oauthUsernameSanitizer.ReplaceAllString(strings.TrimSpace(providerUsername), "_")
	base = strings.Trim(base, "_-")
	if len(base) < 3 {
		base = provider + "_" + shortSubject(subject)
	}
	if len(base) > 24 {
		base = base[:24]
	}
	username := base
	if existing, err := s.repo.UserByUsername(username); err == nil && existing != nil {
		username = kernel.TruncateRunes(base, 23) + "_" + shortSubject(subject)
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil, err
	}
	email = NormalizeEmail(email)
	if email != "" {
		if ValidateEmail(email) != nil {
			email = ""
		} else if existing, err := s.repo.UserByEmail(email); err == nil && existing != nil {
			email = ""
		} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, err
		}
	}
	user := &model.User{ID: kernel.NewID(), Username: username, Email: email, DisplayName: NormalizeDisplayName(displayName, username), Role: model.UserRoleUser, Status: model.UserStatusActive}
	identity := &model.UserIdentity{ID: kernel.NewID(), UserID: user.ID, Provider: provider, Subject: subject, ProviderUsername: providerUsername, AvatarURL: avatarURL}
	return user, identity, nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value = strings.TrimSpace(value); value != "" {
			return value
		}
	}
	return ""
}
