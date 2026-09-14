package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestExportAdminSystemChannelsIncludesConfigurationWithoutSecrets(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	channel := model.ModelChannel{
		ID:          "channel-export",
		UserID:      admin.ID,
		Scope:       model.ChannelScopeSystem,
		Enabled:     false,
		Name:        "Export Channel",
		PublicAlias: "前台渠道",
		BaseURL:     "https://provider.example/v1",
		APIFormat:   "openai",
		APIKey:      "secret-api-key",
		SecretKey:   "secret-secret-key",
		HeadersJSON: `[{"name":"X-Tenant","value":"tenant-secret"}]`,
		ModelsJSON:  `[]`,
	}
	channelModel := model.ChannelModel{
		ID:                   "channel-model-export",
		ChannelID:            channel.ID,
		ModelKey:             "video-model",
		ProviderModelKey:     "provider-video-model",
		DisplayName:          "Video Model",
		Capability:           "video",
		Protocol:             model.ChannelInterfaceNewAPIVideo,
		BillingMode:          "fixed_request",
		PriceConfigured:      true,
		Enabled:              false,
		CapabilityConfigJSON: `{"version":1}`,
	}
	tier := model.ChannelModelPriceTier{
		ID:                    "channel-price-export",
		ChannelModelID:        channelModel.ID,
		SelectorKey:           "{}",
		SelectorJSON:          `{}`,
		Resolution:            "*",
		ProviderModelKey:      "provider-video-model",
		BillingMode:           "fixed_request",
		UnitPriceMicrocredits: 12,
		PriceConfigured:       true,
		Enabled:               true,
	}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&channelModel).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&tier).Error; err != nil {
		t.Fatal(err)
	}

	export, err := svc.ExportAdminSystemChannels(admin)
	if err != nil {
		t.Fatalf("ExportAdminSystemChannels() error = %v", err)
	}
	if len(export.Channels) != 1 || len(export.Channels[0].Models) != 1 || len(export.Channels[0].Models[0].PriceTiers) != 1 {
		t.Fatalf("export = %#v, want one channel, model, and price tier", export)
	}
	if export.Channels[0].Enabled || export.Channels[0].Models[0].Enabled || export.Channels[0].Models[0].PriceTiers[0].UnitPriceMicrocredits != 12 {
		t.Fatalf("export lost disabled or pricing state: %#v", export.Channels[0])
	}
	encoded, err := json.Marshal(export)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"secret-api-key", "secret-secret-key", "tenant-secret"} {
		if bytes.Contains(encoded, []byte(forbidden)) {
			t.Fatalf("export contains secret %q: %s", forbidden, encoded)
		}
	}
	if !bytes.Contains(encoded, []byte(`"hasApiKey":true`)) || !bytes.Contains(encoded, []byte(`"headerNames":["X-Tenant"]`)) {
		t.Fatalf("export omitted safe credential metadata: %s", encoded)
	}
}

func TestExportAdminSystemChannelsRequiresAdmin(t *testing.T) {
	svc, _ := newChannelModelTestService(t)
	_, err := svc.ExportAdminSystemChannels(&model.User{ID: "user", Role: model.UserRoleUser})
	var appErr *AppError
	if !errors.As(err, &appErr) || appErr.Status != http.StatusForbidden {
		t.Fatalf("ExportAdminSystemChannels() error = %#v, want forbidden", err)
	}
}

func TestImportAdminSystemChannelsCreatesDisabledCredentiallessSnapshot(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	result, err := svc.ImportAdminSystemChannels(admin, AdminChannelImportRequest{
		Version: 1,
		Channels: []AdminChannelExportChannel{{
			ID:                "exported-channel-id",
			Name:              "Imported Channel",
			PublicAlias:       "Imported Alias",
			SortOrder:         4,
			BaseURL:           "https://8.8.8.8/v1",
			APIFormat:         "gemini",
			AllowLocalChannel: false,
			ConcurrencyLimit:  8,
			Enabled:           true,
			HasAPIKey:         true,
			HasSecretKey:      true,
			HeaderNames:       []string{"X-Tenant"},
			Models: []AdminChannelExportModel{{
				ID:                    "exported-model-id",
				ModelKey:              "imported-model",
				ProviderModelKey:      "provider-model",
				DisplayName:           "Imported Model",
				SortOrder:             3,
				Capability:            "text",
				Protocol:              model.ChannelInterfaceChatCompletion,
				CapabilityConfig:      DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceChatCompletion), "imported-model"),
				BillingMode:           "fixed_request",
				UnitPriceMicrocredits: 12,
				PriceConfigured:       true,
				Enabled:               true,
				PriceTiers: []AdminChannelExportPriceTier{{
					ProviderModelKey:      "provider-model",
					BillingMode:           "fixed_request",
					UnitPriceMicrocredits: 12,
					PriceConfigured:       true,
					Enabled:               true,
				}},
			}},
		}},
	})
	if err != nil {
		t.Fatalf("ImportAdminSystemChannels() error = %v", err)
	}
	if result.ImportedChannels != 1 || result.ImportedModels != 1 {
		t.Fatalf("import result = %#v, want one channel and model", result)
	}

	var channel model.ModelChannel
	if err := db.First(&channel, "name = ?", "Imported Channel").Error; err != nil {
		t.Fatal(err)
	}
	if channel.ID == "exported-channel-id" || channel.Enabled || channel.APIKey != "" || channel.SecretKey != "" || channel.APIFormat != "gemini" || channel.ConcurrencyLimit != 8 {
		t.Fatalf("imported channel = %#v, want fresh disabled credentialless channel", channel)
	}
	var headers []OutboundHeader
	if err := json.Unmarshal([]byte(channel.HeadersJSON), &headers); err != nil {
		t.Fatal(err)
	}
	if len(headers) != 1 || headers[0].Name != "X-Tenant" || headers[0].Value != "" {
		t.Fatalf("imported headers = %#v, want name only with empty value", headers)
	}

	var item model.ChannelModel
	if err := db.First(&item, "channel_id = ?", channel.ID).Error; err != nil {
		t.Fatal(err)
	}
	if item.ID == "exported-model-id" || item.ModelKey != "imported-model" || !item.Enabled || item.SortOrder != 3 || !item.PriceConfigured || item.UnitPriceMicrocredits != 12 {
		t.Fatalf("imported model = %#v, want fresh enabled model with price", item)
	}
	var tier model.ChannelModelPriceTier
	if err := db.First(&tier, "channel_model_id = ?", item.ID).Error; err != nil {
		t.Fatal(err)
	}
	if tier.UnitPriceMicrocredits != 12 || !tier.PriceConfigured {
		t.Fatalf("imported price tier = %#v, want 12 configured credits", tier)
	}
}

func TestImportAdminSystemChannelsRollsBackOnInvalidModel(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	_, err := svc.ImportAdminSystemChannels(admin, AdminChannelImportRequest{
		Version: 1,
		Channels: []AdminChannelExportChannel{{
			Name: "Should Roll Back",
			BaseURL: "https://8.8.8.8/v1",
			Models: []AdminChannelExportModel{
				{ModelKey: "valid-model", Capability: "text", Protocol: model.ChannelInterfaceChatCompletion},
				{ModelKey: "invalid-model", Capability: "text", Protocol: "not-a-real-protocol"},
			},
		}},
	})
	if err == nil {
		t.Fatal("ImportAdminSystemChannels() error = nil, want invalid protocol error")
	}
	var channelCount int64
	if err := db.Model(&model.ModelChannel{}).Count(&channelCount).Error; err != nil {
		t.Fatal(err)
	}
	if channelCount != 0 {
		t.Fatalf("rollback left %d channels", channelCount)
	}
	var modelCount int64
	if err := db.Model(&model.ChannelModel{}).Count(&modelCount).Error; err != nil {
		t.Fatal(err)
	}
	if modelCount != 0 {
		t.Fatalf("rollback left %d channel models", modelCount)
	}
}

func TestImportAdminSystemChannelsRejectsNonAdminAndDuplicateName(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	_, err := svc.ImportAdminSystemChannels(&model.User{ID: "user", Role: model.UserRoleUser}, AdminChannelImportRequest{Version: 1})
	var appErr *AppError
	if !errors.As(err, &appErr) || appErr.Status != http.StatusForbidden {
		t.Fatalf("ImportAdminSystemChannels() error = %#v, want forbidden", err)
	}

	if err := db.Create(&model.ModelChannel{ID: "existing-channel", Scope: model.ChannelScopeSystem, Name: "Existing Channel", BaseURL: "https://8.8.8.8/v1"}).Error; err != nil {
		t.Fatal(err)
	}
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	_, err = svc.ImportAdminSystemChannels(admin, AdminChannelImportRequest{Version: 1, Channels: []AdminChannelExportChannel{{Name: "Existing Channel", BaseURL: "https://1.1.1.1/v1"}}})
	if err == nil {
		t.Fatal("ImportAdminSystemChannels() error = nil, want duplicate name error")
	}
	var channelCount int64
	if err := db.Model(&model.ModelChannel{}).Count(&channelCount).Error; err != nil {
		t.Fatal(err)
	}
	if channelCount != 1 {
		t.Fatalf("duplicate import changed channel count to %d", channelCount)
	}
}

func TestChannelFromRequestStoresConnectionWithoutDefaultProtocol(t *testing.T) {
	channel, err := channelFromRequest(ChannelRequest{
		Name:             "混合模型渠道",
		BaseURL:          "https://8.8.8.8/v1",
		APIKey:           "access-key",
		SecretKey:        "secret-key",
		ConcurrencyLimit: intPtr(6),
		Models:           []string{"seedance-2.0"},
	}, model.ModelChannel{})
	if err != nil {
		t.Fatalf("channelFromRequest() error = %v", err)
	}
	if channel.APIFormat != "openai" {
		t.Fatalf("APIFormat = %q, want openai", channel.APIFormat)
	}
	if channel.ConcurrencyLimit != 6 {
		t.Fatalf("ConcurrencyLimit = %d, want 6", channel.ConcurrencyLimit)
	}
	if channel.APIKey != "access-key" || channel.SecretKey != "secret-key" {
		t.Fatal("channel credentials were not stored")
	}
}

func TestMergeChannelRequestSupportsEnabledOnlyPatch(t *testing.T) {
	enabled := false
	req := mergeChannelRequest(ChannelRequest{Enabled: &enabled}, model.ModelChannel{
		Name:        "Video",
		BaseURL:     "https://example.com/v1",
		APIFormat:   "openai",
		ModelsJSON:  `["custom-video"]`,
		HeadersJSON: `[{"name":"User-Agent","value":"Stored Agent"}]`,
	})
	if req.Name != "Video" || req.BaseURL != "https://example.com/v1" || len(req.Models) != 1 || len(req.Headers) != 1 {
		t.Fatalf("mergeChannelRequest() = %#v", req)
	}
}

func TestUpdateSystemChannelEnabledOnlySkipsOutboundResolution(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	svc.dataDir = t.TempDir()
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	channel := model.ModelChannel{ID: "channel-1", UserID: admin.ID, Scope: model.ChannelScopeSystem, Enabled: true, Name: "Dead", BaseURL: "https://dead.invalid/v1", APIKey: "key", APIFormat: "openai", ModelsJSON: `[]`}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	disabled := false
	updated, err := svc.UpdateSystemChannel(admin, channel.ID, ChannelRequest{Enabled: &disabled})
	if err != nil {
		t.Fatalf("UpdateSystemChannel() should not resolve the stored URL for an enabled-only patch: %v", err)
	}
	if updated.Enabled {
		t.Fatal("UpdateSystemChannel() did not persist disabled state")
	}
	var stored model.ModelChannel
	if err := db.First(&stored, "id = ?", channel.ID).Error; err != nil {
		t.Fatal(err)
	}
	if stored.Enabled {
		t.Fatal("stored channel is still enabled after update")
	}
}

func TestChannelFromRequestStoresAndClearsHeaders(t *testing.T) {
	request := ChannelRequest{Name: "Headers", BaseURL: "https://example.com/v1", Headers: []OutboundHeader{{Name: "User-Agent", Value: "Custom Agent"}}}
	channel, err := channelFromRequest(request, model.ModelChannel{})
	if err != nil {
		t.Fatal(err)
	}
	if channel.HeadersJSON != `[{"name":"User-Agent","value":"Custom Agent"}]` {
		t.Fatalf("HeadersJSON = %q", channel.HeadersJSON)
	}

	request.Headers = []OutboundHeader{}
	channel, err = channelFromRequest(request, channel)
	if err != nil {
		t.Fatal(err)
	}
	if channel.HeadersJSON != `[]` {
		t.Fatalf("cleared HeadersJSON = %q", channel.HeadersJSON)
	}
}

func TestPublicChannelOnlyReturnsSystemHeadersToAdmin(t *testing.T) {
	channel := model.ModelChannel{ID: "system-1", Scope: model.ChannelScopeSystem, BaseURL: "https://example.com/v1", HeadersJSON: `[{"name":"X-Gateway-Tenant","value":"tenant-a"}]`}
	adminView := publicChannel(channel, true, nil)
	if len(adminView.Headers) != 1 || adminView.Headers[0].Name != "X-Gateway-Tenant" {
		t.Fatalf("admin headers = %#v", adminView.Headers)
	}
	userView := publicChannel(channel, false, nil)
	if len(userView.Headers) != 0 {
		t.Fatalf("user headers = %#v", userView.Headers)
	}
}

func TestChannelFromRequestRejectsInvalidConcurrencyLimit(t *testing.T) {
	for _, limit := range []int{0, 1000} {
		_, err := channelFromRequest(ChannelRequest{Name: "Bad", BaseURL: "https://example.com/v1", ConcurrencyLimit: &limit}, model.ModelChannel{})
		if err == nil {
			t.Fatalf("channelFromRequest() concurrencyLimit = %d, error = nil", limit)
		}
	}
}

func TestRuntimeConcurrencyUsesEnvironmentFallback(t *testing.T) {
	t.Setenv("CANVAS_CHANNEL_CONCURRENCY", "7")
	t.Setenv("CANVAS_WORKER_CONCURRENCY", "9")
	setting := defaultRuntimePolicy().Task
	if setting.ChannelConcurrency != 7 || setting.WorkerConcurrency != 9 {
		t.Fatalf("runtimeConcurrencyFromEnvironment() = %#v", setting)
	}

	useGlobal := true
	channel, err := channelFromRequest(ChannelRequest{Name: "Global", BaseURL: "https://example.com/v1", UseGlobalConcurrency: &useGlobal}, model.ModelChannel{ConcurrencyLimit: 4})
	if err != nil || channel.ConcurrencyLimit != 0 {
		t.Fatalf("global concurrency channel = %#v, error = %v", channel, err)
	}
}

func TestFetchAdminChannelModelsReaddsDeletedModel(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"model-a"}]}`))
	}))
	defer upstream.Close()

	svc, db := newChannelModelTestService(t)
	svc.runtimeCapabilities = RuntimeCapabilities{desktopLocalChannels: true}
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	channel := model.ModelChannel{ID: "channel-1", UserID: admin.ID, Scope: model.ChannelScopeSystem, Enabled: true, Name: "Test", BaseURL: upstream.URL + "/v1", APIKey: "key", APIFormat: "openai", ModelsJSON: `[]`, AllowLocalChannel: true}
	deleted := model.ChannelModel{ID: "deleted-model", ChannelID: channel.ID, ModelKey: "model-a", DisplayName: "model-a", BillingMode: "fixed_request", PriceVersion: 1}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&deleted).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Delete(&deleted).Error; err != nil {
		t.Fatal(err)
	}

	result, err := svc.FetchAdminChannelModels(context.Background(), admin, channel.ID)
	if err != nil {
		t.Fatal(err)
	}
	if result.Added != 1 {
		t.Fatalf("Added = %d, want 1", result.Added)
	}
	var active model.ChannelModel
	if err := db.First(&active, "channel_id = ? AND model_key = ?", channel.ID, "model-a").Error; err != nil {
		t.Fatal(err)
	}
	if active.ID == deleted.ID || active.Enabled || active.PriceConfigured {
		t.Fatalf("re-added model = %#v", active)
	}
	var total int64
	if err := db.Unscoped().Model(&model.ChannelModel{}).Where("channel_id = ? AND model_key = ?", channel.ID, "model-a").Count(&total).Error; err != nil {
		t.Fatal(err)
	}
	if total != 2 {
		t.Fatalf("model history count = %d, want 2", total)
	}
}

func TestImportAdminChannelModelsOnlyImportsSelectedModels(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"model-a"},{"id":"model-b"}]}`))
	}))
	defer upstream.Close()

	svc, db := newChannelModelTestService(t)
	svc.runtimeCapabilities = RuntimeCapabilities{desktopLocalChannels: true}
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	channel := model.ModelChannel{ID: "channel-1", UserID: admin.ID, Scope: model.ChannelScopeSystem, Enabled: true, Name: "Test", BaseURL: upstream.URL + "/v1", APIKey: "key", APIFormat: "openai", ModelsJSON: `[]`, AllowLocalChannel: true}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}

	preview, err := svc.PreviewAdminChannelModels(context.Background(), admin, channel.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(preview) != 2 {
		t.Fatalf("preview models = %#v, want two models", preview)
	}
	var before int64
	if err := db.Model(&model.ChannelModel{}).Where("channel_id = ?", channel.ID).Count(&before).Error; err != nil {
		t.Fatal(err)
	}
	if before != 0 {
		t.Fatalf("preview created %d channel models", before)
	}

	result, err := svc.ImportAdminChannelModels(context.Background(), admin, channel.ID, []string{"model-b"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Added != 1 || len(result.Models) != 1 || result.Models[0] != "model-b" {
		t.Fatalf("import result = %#v, want only model-b", result)
	}
	var imported []model.ChannelModel
	if err := db.Where("channel_id = ?", channel.ID).Find(&imported).Error; err != nil {
		t.Fatal(err)
	}
	if len(imported) != 1 || imported[0].ModelKey != "model-b" {
		t.Fatalf("imported models = %#v, want only model-b", imported)
	}
}

func TestImportAdminChannelModelsRejectsUnknownSelection(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"model-a"}]}`))
	}))
	defer upstream.Close()

	svc, db := newChannelModelTestService(t)
	svc.runtimeCapabilities = RuntimeCapabilities{desktopLocalChannels: true}
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	channel := model.ModelChannel{ID: "channel-1", UserID: admin.ID, Scope: model.ChannelScopeSystem, Enabled: true, Name: "Test", BaseURL: upstream.URL + "/v1", APIKey: "key", APIFormat: "openai", ModelsJSON: `[]`, AllowLocalChannel: true}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}

	_, err := svc.ImportAdminChannelModels(context.Background(), admin, channel.ID, []string{"not-in-catalog"})
	var authErr *AuthError
	if !errors.As(err, &authErr) || authErr.Message != "所选模型不在上游模型目录中：not-in-catalog" {
		t.Fatalf("ImportAdminChannelModels() error = %#v", err)
	}
	var count int64
	if err := db.Model(&model.ChannelModel{}).Where("channel_id = ?", channel.ID).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("unknown selection created %d channel models", count)
	}
}

func TestSaveAdminChannelModelRejectsActiveDuplicateKey(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	channel := model.ModelChannel{ID: "channel-1", UserID: admin.ID, Scope: model.ChannelScopeSystem, Enabled: true, Name: "Test", BaseURL: "https://example.com/v1", APIKey: "key", APIFormat: "openai", ModelsJSON: `[]`}
	items := []model.ChannelModel{
		{ID: "model-a", ChannelID: channel.ID, ModelKey: "model-a", DisplayName: "Model A", Capability: "text", Protocol: model.ChannelInterfaceChatCompletion, BillingMode: "fixed_request", Enabled: true, PriceVersion: 1},
		{ID: "model-b", ChannelID: channel.ID, ModelKey: "model-b", DisplayName: "Model B", Capability: "text", Protocol: model.ChannelInterfaceChatCompletion, BillingMode: "fixed_request", Enabled: true, PriceVersion: 1},
	}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&items).Error; err != nil {
		t.Fatal(err)
	}
	enabled := true
	_, err := svc.SaveAdminChannelModel(admin, channel.ID, items[0].ID, ChannelModelRequest{ModelKey: "model-b", DisplayName: "Duplicate", Capability: "text", Protocol: string(model.ChannelInterfaceChatCompletion), BillingMode: "fixed_request", Enabled: &enabled})
	var authErr *AuthError
	if !errors.As(err, &authErr) || authErr.Status != http.StatusBadRequest || authErr.Message != "该渠道已存在模型 model-b，请直接编辑已有模型" {
		t.Fatalf("SaveAdminChannelModel() error = %#v", err)
	}
}

func TestDeleteAdminChannelModelsDeletesSelectionAtomically(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	channel := model.ModelChannel{ID: "channel-1", UserID: admin.ID, Scope: model.ChannelScopeSystem, Enabled: true, Name: "Test", BaseURL: "https://example.com/v1", APIKey: "key", APIFormat: "openai", ModelsJSON: `["model-a","model-b","model-c"]`}
	items := []model.ChannelModel{
		{ID: "model-a", ChannelID: channel.ID, ModelKey: "model-a", DisplayName: "Model A", Enabled: true, PriceVersion: 1},
		{ID: "model-b", ChannelID: channel.ID, ModelKey: "model-b", DisplayName: "Model B", Enabled: true, PriceVersion: 1},
		{ID: "model-c", ChannelID: channel.ID, ModelKey: "model-c", DisplayName: "Model C", Enabled: true, PriceVersion: 1},
	}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&items).Error; err != nil {
		t.Fatal(err)
	}

	deleted, err := svc.DeleteAdminChannelModels(admin, channel.ID, []string{" model-a ", "model-b", "model-a"})
	if err != nil {
		t.Fatal(err)
	}
	if deleted != 2 {
		t.Fatalf("deleted = %d, want 2", deleted)
	}
	var storedChannel model.ModelChannel
	if err := db.First(&storedChannel, "id = ?", channel.ID).Error; err != nil {
		t.Fatal(err)
	}
	if storedChannel.ModelsJSON != `["model-c"]` {
		t.Fatalf("ModelsJSON = %s, want model-c only", storedChannel.ModelsJSON)
	}
	var active []model.ChannelModel
	if err := db.Where("channel_id = ?", channel.ID).Find(&active).Error; err != nil {
		t.Fatal(err)
	}
	if len(active) != 1 || active[0].ID != "model-c" {
		t.Fatalf("active models = %#v, want model-c", active)
	}
	var removed []model.ChannelModel
	if err := db.Unscoped().Where("channel_id = ? AND id IN ?", channel.ID, []string{"model-a", "model-b"}).Find(&removed).Error; err != nil {
		t.Fatal(err)
	}
	if len(removed) != 2 {
		t.Fatalf("removed models = %#v, want two", removed)
	}
	for _, item := range removed {
		if item.Enabled || item.PriceVersion != 2 || !item.DeletedAt.Valid {
			t.Fatalf("removed model state = %#v", item)
		}
	}
}

func TestDeleteAdminChannelModelsRejectsWholeSelectionWhenOneModelIsInUse(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	channel := model.ModelChannel{ID: "channel-1", UserID: admin.ID, Scope: model.ChannelScopeSystem, Enabled: true, Name: "Test", BaseURL: "https://example.com/v1", APIKey: "key", APIFormat: "openai", ModelsJSON: `["model-a","model-b"]`}
	items := []model.ChannelModel{
		{ID: "model-a", ChannelID: channel.ID, ModelKey: "model-a", DisplayName: "Model A", Enabled: true, PriceVersion: 1},
		{ID: "model-b", ChannelID: channel.ID, ModelKey: "model-b", DisplayName: "Model B", Enabled: true, PriceVersion: 1},
	}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&items).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Task{ID: "task-running", ChannelModelID: "model-b", Status: model.TaskStatusRunning}).Error; err != nil {
		t.Fatal(err)
	}

	deleted, err := svc.DeleteAdminChannelModels(admin, channel.ID, []string{"model-a", "model-b"})
	var authErr *AuthError
	if !errors.As(err, &authErr) || authErr.Message != "所选渠道模型中有模型仍被前台模型供应线路或进行中任务使用，本次未删除任何模型" {
		t.Fatalf("DeleteAdminChannelModels() deleted = %d, error = %#v", deleted, err)
	}
	var active int64
	if err := db.Model(&model.ChannelModel{}).Where("channel_id = ?", channel.ID).Count(&active).Error; err != nil {
		t.Fatal(err)
	}
	if active != 2 {
		t.Fatalf("active models = %d, want 2 after atomic rejection", active)
	}
	var storedChannel model.ModelChannel
	if err := db.First(&storedChannel, "id = ?", channel.ID).Error; err != nil {
		t.Fatal(err)
	}
	if storedChannel.ModelsJSON != channel.ModelsJSON {
		t.Fatalf("ModelsJSON changed after rejected batch: %s", storedChannel.ModelsJSON)
	}
}

func TestNormalizeAdminChannelModelDeleteIDsRequiresBoundedSelection(t *testing.T) {
	if _, err := normalizeAdminChannelModelDeleteIDs([]string{"", " "}); err == nil {
		t.Fatal("empty selection should be rejected")
	}
	values := make([]string, 101)
	for index := range values {
		values[index] = "model-" + strconv.Itoa(index)
	}
	if _, err := normalizeAdminChannelModelDeleteIDs(values); err == nil {
		t.Fatal("selection above 100 models should be rejected")
	}
}

func TestResolveProviderConfigMapsSKUToProviderModel(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	svc.dataDir = t.TempDir()
	channel := model.ModelChannel{
		ID: "channel-1", Scope: model.ChannelScopeSystem, Enabled: true, Name: "Seedance",
		BaseURL: "https://ark.cn-beijing.volces.com/api/v3", APIKey: "test-key", APIFormat: "openai", ModelsJSON: `["seedance-2-5-480p"]`,
	}
	if err := svc.encryptSystemChannelSecrets(&channel); err != nil {
		t.Fatal(err)
	}
	item := model.ChannelModel{
		ID: "model-1", ChannelID: channel.ID, ModelKey: "seedance-2-5-480p", ProviderModelKey: "doubao-seedance-2-5",
		Capability: "video", Protocol: model.ChannelInterfaceVolcengineArkVideo, Enabled: true,
	}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&item).Error; err != nil {
		t.Fatal(err)
	}

	config, err := svc.resolveProviderConfig(providerConfig{ChannelID: channel.ID, Model: item.ModelKey})
	if err != nil {
		t.Fatal(err)
	}
	if config.ChannelModelKey != item.ModelKey || config.Model != item.ProviderModelKey {
		t.Fatalf("resolved config = %#v", config)
	}
}

func TestValidateTaskCapabilityFixesSingleResolutionSKU(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	video := DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceVolcengineArkVideo), "doubao-seedance-2-5").Video
	video.References.MaxVideos = 0
	video.Resolutions = []string{"480p"}
	video.DefaultResolution = "480p"
	encoded, err := json.Marshal(&ModelCapabilityConfig{Version: 1, Video: video})
	if err != nil {
		t.Fatal(err)
	}
	channelModel := model.ChannelModel{
		ID: "model-480p", ChannelID: "channel-1", ModelKey: "doubao-seedance-2-5-480p", ProviderModelKey: "doubao-seedance-2-5",
		Capability: "video", Protocol: model.ChannelInterfaceVolcengineArkVideo, Enabled: true, CapabilityConfigJSON: string(encoded),
	}
	if err := db.Create(&channelModel).Error; err != nil {
		t.Fatal(err)
	}
	input := map[string]any{
		"mode": "video",
		"config": map[string]any{
			"channelId": "channel-1", "model": channelModel.ModelKey, "vquality": "auto", "videoSeconds": "6", "size": "16:9",
			"videoGenerateAudio": "true", "videoWatermark": "false",
		},
	}
	if err := svc.ValidateTaskCapability(input); err != nil {
		t.Fatal(err)
	}
	config := input["config"].(map[string]any)
	if got := config["vquality"]; got != "480p" {
		t.Fatalf("vquality = %#v, want 480p", got)
	}
}

func newChannelModelTestService(t *testing.T) (*Service, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+newID()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.ModelChannel{}, &model.ChannelModel{}, &model.ChannelModelPriceTier{}, &model.LogicalModel{}, &model.LogicalModelRevision{}, &model.LogicalModelRoute{}, &model.Task{}, &model.IDSequence{}); err != nil {
		t.Fatal(err)
	}
	return &Service{repo: repository.New(db)}, db
}

func intPtr(value int) *int { return &value }
