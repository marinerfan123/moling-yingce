package auth

import (
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/kernel"
	"infinite-canvas/backend/internal/model"

	"gorm.io/gorm"
)

func TestRegistrationVerificationSwitchesMatchAdminSettings(t *testing.T) {
	cases := []struct {
		name        string
		emailOn     bool
		phoneOn     bool
		expectPhone string
	}{
		{name: "both disabled"},
		{name: "email only", emailOn: true},
		{name: "phone only", phoneOn: true, expectPhone: "13800138000"},
		{name: "both enabled", emailOn: true, phoneOn: true, expectPhone: "13800138000"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc, db := newSMSRegistrationTestService(t)
			admin := &model.User{ID: "admin", Username: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
			if err := db.Create(admin).Error; err != nil {
				t.Fatal(err)
			}
			setRegistrationEmailVerification(t, svc, admin, tc.emailOn)
			setRegistrationPhoneVerification(t, svc, admin, tc.phoneOn)

			email := "member@example.com"
			phone := ""
			if tc.phoneOn {
				phone = "+86 13800138000"
			}
			if tc.emailOn {
				insertRegistrationEmailCode(t, svc, db, email, "123456")
			}
			if tc.phoneOn {
				insertRegistrationPhoneCode(t, svc, db, "13800138000", "654321")
			}

			result, err := svc.Register(RegisterRequest{
				Username:  "member-" + registrationCaseSuffix(tc.name),
				Email:     email,
				EmailCode: "123456",
				Phone:     phone,
				PhoneCode: "654321",
				Password:  "strong-password",
			})
			if err != nil {
				t.Fatalf("registration failed: %v", err)
			}
			if result.User.Phone != tc.expectPhone {
				t.Fatalf("registered phone = %q, want %q", result.User.Phone, tc.expectPhone)
			}
			if tc.emailOn {
				assertEmailCodeUsed(t, db, email)
			} else {
				assertNoEmailCode(t, db)
			}
			if tc.phoneOn {
				assertPhoneCodeUsed(t, db, "13800138000")
			} else {
				assertNoPhoneCode(t, db)
			}
		})
	}
}

func TestPublicAuthSettingsExposeVerificationSwitches(t *testing.T) {
	cases := []struct {
		name    string
		emailOn bool
		phoneOn bool
	}{
		{name: "both disabled"},
		{name: "email enabled", emailOn: true},
		{name: "phone enabled", phoneOn: true},
		{name: "both enabled", emailOn: true, phoneOn: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc, db := newSMSRegistrationTestService(t)
			admin := &model.User{ID: "admin", Username: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
			if err := db.Create(admin).Error; err != nil {
				t.Fatal(err)
			}
			setRegistrationEmailVerification(t, svc, admin, tc.emailOn)
			setRegistrationPhoneVerification(t, svc, admin, tc.phoneOn)

			settings, err := svc.PublicAuthSettings()
			if err != nil {
				t.Fatal(err)
			}
			if settings.EmailCodeRequired != tc.emailOn || settings.PhoneCodeRequired != tc.phoneOn {
				t.Fatalf("verification settings = email:%v phone:%v, want email:%v phone:%v", settings.EmailCodeRequired, settings.PhoneCodeRequired, tc.emailOn, tc.phoneOn)
			}
		})
	}
}

func setRegistrationEmailVerification(t *testing.T, svc *Service, admin *model.User, enabled bool) {
	t.Helper()
	_, err := svc.UpdateEmailSetting(admin, EmailSettingRequest{
		Enabled: enabled, Host: "smtp.example.com", Port: 587, Encryption: "starttls", FromEmail: "noreply@example.com",
		RegistrationAllowedDomains: []string{"example.com"},
	})
	if err != nil {
		t.Fatal(err)
	}
}

func setRegistrationPhoneVerification(t *testing.T, svc *Service, admin *model.User, enabled bool) {
	t.Helper()
	_, err := svc.UpdateSMSSetting(admin, SMSSettingRequest{
		Enabled: enabled, Provider: smsProviderStandard, Endpoint: "http://127.0.0.1:1/send", TemplateCode: "register-code",
	})
	if err != nil {
		t.Fatal(err)
	}
}

func insertRegistrationEmailCode(t *testing.T, svc *Service, db *gorm.DB, email string, code string) {
	t.Helper()
	hash, err := svc.emailVerificationCodeHash(registrationEmailPurpose, email, code)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.EmailVerificationCode{ID: kernel.NewID(), Email: email, CodeHash: hash, Purpose: registrationEmailPurpose, ExpiresAt: time.Now().Add(time.Minute), CreatedAt: time.Now()}).Error; err != nil {
		t.Fatal(err)
	}
}

func insertRegistrationPhoneCode(t *testing.T, svc *Service, db *gorm.DB, phone string, code string) {
	t.Helper()
	hash, err := svc.phoneVerificationCodeHash(registrationPhonePurpose, phone, code)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.PhoneVerificationCode{ID: kernel.NewID(), Phone: phone, CodeHash: hash, Purpose: registrationPhonePurpose, ExpiresAt: time.Now().Add(time.Minute), CreatedAt: time.Now()}).Error; err != nil {
		t.Fatal(err)
	}
}

func assertEmailCodeUsed(t *testing.T, db *gorm.DB, email string) {
	t.Helper()
	var record model.EmailVerificationCode
	if err := db.Where("email = ? AND purpose = ?", email, registrationEmailPurpose).First(&record).Error; err != nil {
		t.Fatal(err)
	}
	if record.UsedAt == nil {
		t.Fatalf("email verification code for %q was not consumed", email)
	}
}

func assertNoEmailCode(t *testing.T, db *gorm.DB) {
	t.Helper()
	var count int64
	if err := db.Model(&model.EmailVerificationCode{}).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("email verification records = %d, want 0", count)
	}
}

func assertPhoneCodeUsed(t *testing.T, db *gorm.DB, phone string) {
	t.Helper()
	var record model.PhoneVerificationCode
	if err := db.Where("phone = ? AND purpose = ?", phone, registrationPhonePurpose).First(&record).Error; err != nil {
		t.Fatal(err)
	}
	if record.UsedAt == nil {
		t.Fatalf("phone verification code for %q was not consumed", phone)
	}
}

func assertNoPhoneCode(t *testing.T, db *gorm.DB) {
	t.Helper()
	var count int64
	if err := db.Model(&model.PhoneVerificationCode{}).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("phone verification records = %d, want 0", count)
	}
}

func registrationCaseSuffix(value string) string {
	return strings.ReplaceAll(value, " ", "-")
}
