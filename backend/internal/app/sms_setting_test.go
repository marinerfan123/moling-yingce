package app

import (
	"strings"
	"testing"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestUpdateSMSSettingEncryptsSecretsAtRest(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+newID()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.User{}, &model.SystemSetting{}); err != nil {
		t.Fatal(err)
	}
	admin := &model.User{ID: "admin", Username: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	if err := db.Create(admin).Error; err != nil {
		t.Fatal(err)
	}
	svc := New(repository.New(db), t.TempDir())
	if _, err := svc.UpdateSMSSetting(admin, SMSSettingRequest{
		Enabled: true, Provider: "standard", Endpoint: "http://127.0.0.1:1/send", TemplateCode: "register-code", APIKey: "secret-api-key",
	}); err != nil {
		t.Fatal(err)
	}
	stored, err := repository.New(db).SystemSetting("sms")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(stored.ValueJSON, "secret-api-key") {
		t.Fatal("SMS API key was stored in plaintext")
	}
	read, err := svc.AdminSMSSetting(admin)
	if err != nil || !read.HasAPIKey {
		t.Fatalf("encrypted SMS setting did not round-trip: setting=%#v err=%v", read, err)
	}
}
