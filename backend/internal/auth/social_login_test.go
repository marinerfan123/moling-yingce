package auth

import (
	"encoding/json"
	"strings"
	"testing"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestSocialLoginSettingsUseProviderDefaultsAndRedactSecrets(t *testing.T) {
	svc, db := newSocialLoginTestService(t)
	admin := &model.User{ID: "admin-1", Username: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	if err := db.Create(admin).Error; err != nil {
		t.Fatal(err)
	}

	wechat, err := svc.AdminWeChatSetting(admin)
	if err != nil {
		t.Fatal(err)
	}
	if wechat.Enabled || wechat.HasClientSecret || wechat.AuthorizationURL != "https://open.weixin.qq.com/connect/qrconnect" || len(wechat.Scopes) != 1 || wechat.Scopes[0] != "snsapi_login" {
		t.Fatalf("unexpected WeChat defaults: %#v", wechat)
	}

	request := socialLoginTestRequest("wechat")
	request.ClientSecret = "wechat-secret"
	updated, err := svc.UpdateWeChatSetting(admin, request)
	if err != nil {
		t.Fatal(err)
	}
	if !updated.Enabled || !updated.HasClientSecret {
		t.Fatalf("secret state was not returned safely: %#v", updated)
	}
	encoded, err := json.Marshal(updated)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), "wechat-secret") {
		t.Fatalf("public setting leaked secret: %s", encoded)
	}
	stored, err := dbSystemSetting(db, wechatSettingKey)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(stored.ValueJSON, "wechat-secret") {
		t.Fatalf("test host did not persist secret for redaction check: %s", stored.ValueJSON)
	}
}

func TestSocialLoginSettingValidationRequiresSecureEndpoints(t *testing.T) {
	svc, db := newSocialLoginTestService(t)
	admin := &model.User{ID: "admin-1", Username: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	if err := db.Create(admin).Error; err != nil {
		t.Fatal(err)
	}
	request := socialLoginTestRequest("douyin")
	request.AuthorizationURL = "http://example.com/connect"
	if _, err := svc.UpdateDouyinSetting(admin, request); err == nil {
		t.Fatal("insecure provider endpoint should be rejected")
	}
}

func TestBeginSocialLoginKeepsOAuthStatesProviderScoped(t *testing.T) {
	svc, db := newSocialLoginTestService(t)
	admin := &model.User{ID: "admin-1", Username: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	if err := db.Create(admin).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.UpdateWeChatSetting(admin, socialLoginTestRequest("wechat")); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.UpdateDouyinSetting(admin, socialLoginTestRequest("douyin")); err != nil {
		t.Fatal(err)
	}
	wechatURL, err := svc.BeginSocialLogin("wechat", "/create")
	if err != nil {
		t.Fatal(err)
	}
	douyinURL, err := svc.BeginSocialLogin("douyin", "/create")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(wechatURL, "appid=wechat-client") || !strings.Contains(wechatURL, "wechat_redirect") {
		t.Fatalf("unexpected WeChat authorization URL: %s", wechatURL)
	}
	if !strings.Contains(douyinURL, "client_key=douyin-client") {
		t.Fatalf("unexpected Douyin authorization URL: %s", douyinURL)
	}
	var states []model.OAuthState
	if err := db.Order("provider asc").Find(&states).Error; err != nil {
		t.Fatal(err)
	}
	if len(states) != 2 || states[0].Provider != "douyin" || states[1].Provider != "wechat" {
		t.Fatalf("OAuth states were not provider scoped: %#v", states)
	}
}

func TestSocialProfileValuesReadProviderSpecificPayloads(t *testing.T) {
	wechatSubject, wechatUsername, wechatDisplayName, _, wechatAvatar := socialProfileValues("wechat", socialLoginToken{IdentitySubject: "wechat-openid"}, map[string]any{
		"openid": "wechat-openid", "nickname": "微信昵称", "headimgurl": "https://example.com/wechat.png",
	})
	if wechatSubject != "wechat-openid" || wechatUsername != "微信昵称" || wechatDisplayName != "微信昵称" || wechatAvatar == "" {
		t.Fatalf("unexpected WeChat profile values: %q %q %q %q", wechatSubject, wechatUsername, wechatDisplayName, wechatAvatar)
	}

	douyinSubject, douyinUsername, douyinDisplayName, _, douyinAvatar := socialProfileValues("douyin", socialLoginToken{IdentitySubject: "douyin-openid"}, map[string]any{
		"data": map[string]any{"open_id": "douyin-openid", "display_name": "抖音昵称", "avatar": "https://example.com/douyin.png"},
	})
	if douyinSubject != "douyin-openid" || douyinUsername != "抖音昵称" || douyinDisplayName != "抖音昵称" || douyinAvatar == "" {
		t.Fatalf("unexpected Douyin profile values: %q %q %q %q", douyinSubject, douyinUsername, douyinDisplayName, douyinAvatar)
	}
}

func socialLoginTestRequest(provider string) SocialLoginSettingRequest {
	return SocialLoginSettingRequest{
		Enabled: true, ClientID: provider + "-client", ClientSecret: provider + "-secret",
		AuthorizationURL: "https://auth.example.com/" + provider,
		TokenURL:         "https://token.example.com/" + provider,
		UserInfoURL:      "https://profile.example.com/" + provider,
		RedirectURL:      "https://canvas.example.com/oauth/" + provider + "/callback",
		Scopes:           []string{"user_info"},
	}
}

func newSocialLoginTestService(t *testing.T) (*Service, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.User{}, &model.UserIdentity{}, &model.AuthSession{}, &model.CreditAccount{}, &model.OAuthState{}, &model.SystemSetting{}); err != nil {
		t.Fatal(err)
	}
	return New(repository.New(db), nil, nil), db
}

func dbSystemSetting(db *gorm.DB, key string) (*model.SystemSetting, error) {
	var setting model.SystemSetting
	err := db.First(&setting, "key = ?", key).Error
	return &setting, err
}
