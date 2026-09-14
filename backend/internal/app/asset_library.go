package app

import (
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"infinite-canvas/backend/internal/canvas"
	"infinite-canvas/backend/internal/model"

	"gorm.io/gorm"
)

type UserAssetPage struct {
	Assets         []json.RawMessage `json:"assets"`
	KindCounts     map[string]int64  `json:"kindCounts"`
	CategoryCounts map[string]int64  `json:"categoryCounts"`
	FolderCounts   map[string]int64  `json:"folderCounts"`
	Page           int               `json:"page"`
	PageSize       int               `json:"pageSize"`
	Total          int64             `json:"total"`
	HasMore        bool              `json:"hasMore"`
}

type UserAssetPageFilter struct {
	Kind          string
	Category      string
	FolderID      *string
	Uncategorized bool
	Status        string
	Query         string
}

type CreateAssetFolderRequest struct {
	Name string `json:"name"`
}

type UpdateAssetFolderRequest struct {
	Name string `json:"name"`
}

type MoveUserAssetsRequest struct {
	AssetIDs []string `json:"assetIds"`
	FolderID string   `json:"folderId"`
}

func (s *Service) UserAssetsPage(userID string, page int, pageSize int, filter UserAssetPageFilter) (UserAssetPage, error) {
	page, pageSize = normalizeProjectPage(page, pageSize, 120)
	assets, err := s.repo.Assets(userID)
	if err != nil {
		return UserAssetPage{}, err
	}
	allowed, err := s.desktopLocalToolsAllowedForUserID(userID)
	if err != nil {
		return UserAssetPage{}, err
	}
	visible := make([]model.Asset, 0, len(assets))
	for _, asset := range assets {
		if !allowed && canvas.IsDesktopLocalAsset(asset) {
			continue
		}
		if !userAssetMatchesFilter(asset, filter) {
			continue
		}
		visible = append(visible, asset)
	}
	total := int64(len(visible))
	start := (page - 1) * pageSize
	if start > len(visible) {
		start = len(visible)
	}
	end := start + pageSize
	if end > len(visible) {
		end = len(visible)
	}
	rawAssets := make([]json.RawMessage, 0, end-start)
	for _, asset := range visible[start:end] {
		if payload := clientAssetPayload(asset); len(payload) > 0 {
			rawAssets = append(rawAssets, payload)
		}
	}
	kindCounts := map[string]int64{}
	categoryCounts := map[string]int64{}
	folderCounts := map[string]int64{}
	for _, asset := range assets {
		if (!allowed && canvas.IsDesktopLocalAsset(asset)) || !userAssetStatusMatches(asset, filter.Status) {
			continue
		}
		kindCounts[asset.Kind]++
		categoryCounts[string(asset.Category)]++
		folderCounts[asset.FolderID]++
	}
	return UserAssetPage{
		Assets: rawAssets, KindCounts: kindCounts, CategoryCounts: categoryCounts, FolderCounts: folderCounts,
		Page: page, PageSize: pageSize, Total: total, HasMore: int64(page*pageSize) < total,
	}, nil
}

func userAssetMatchesFilter(asset model.Asset, filter UserAssetPageFilter) bool {
	if value := strings.TrimSpace(filter.Kind); value != "" && asset.Kind != value {
		return false
	}
	if value := strings.TrimSpace(filter.Category); value != "" && string(asset.Category) != value {
		return false
	}
	if filter.Uncategorized {
		if strings.TrimSpace(asset.FolderID) != "" {
			return false
		}
	} else if filter.FolderID != nil && asset.FolderID != strings.TrimSpace(*filter.FolderID) {
		return false
	}
	if !userAssetStatusMatches(asset, filter.Status) {
		return false
	}
	if query := strings.ToLower(strings.TrimSpace(filter.Query)); query != "" && !strings.Contains(strings.ToLower(asset.Title), query) && !strings.Contains(strings.ToLower(asset.PayloadJSON), query) {
		return false
	}
	return true
}

func userAssetStatusMatches(asset model.Asset, status string) bool {
	switch strings.TrimSpace(status) {
	case "active":
		return asset.Status != model.AssetVersionStatusArchived
	case "archived":
		return asset.Status == model.AssetVersionStatusArchived
	case "":
		return true
	default:
		return string(asset.Status) == strings.TrimSpace(status)
	}
}

func (s *Service) AssetFolders(userID string) ([]model.AssetFolder, error) {
	return s.repo.AssetFolders(userID)
}

func (s *Service) CreateAssetFolder(userID string, req CreateAssetFolderRequest) (model.AssetFolder, error) {
	name, nameKey, err := normalizeAssetFolderName(req.Name)
	if err != nil {
		return model.AssetFolder{}, err
	}
	exists, err := s.repo.AssetFolderNameExists(userID, nameKey, "")
	if err != nil {
		return model.AssetFolder{}, err
	}
	if exists {
		return model.AssetFolder{}, BadAuthRequest("已存在同名素材分类")
	}
	position, err := s.repo.NextAssetFolderPosition(userID)
	if err != nil {
		return model.AssetFolder{}, err
	}
	now := time.Now().UTC()
	folder := model.AssetFolder{ID: newID(), UserID: userID, Name: name, NameKey: nameKey, Position: position, CreatedAt: now, UpdatedAt: now}
	if err := s.repo.CreateAssetFolder(&folder); err != nil {
		return model.AssetFolder{}, err
	}
	return folder, nil
}

func (s *Service) UpdateAssetFolder(userID string, folderID string, req UpdateAssetFolderRequest) (model.AssetFolder, error) {
	folder, err := s.repo.AssetFolderForUser(userID, strings.TrimSpace(folderID))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.AssetFolder{}, BadAuthRequest("素材分类不存在")
		}
		return model.AssetFolder{}, err
	}
	name, nameKey, err := normalizeAssetFolderName(req.Name)
	if err != nil {
		return model.AssetFolder{}, err
	}
	exists, err := s.repo.AssetFolderNameExists(userID, nameKey, folder.ID)
	if err != nil {
		return model.AssetFolder{}, err
	}
	if exists {
		return model.AssetFolder{}, BadAuthRequest("已存在同名素材分类")
	}
	folder.Name = name
	folder.NameKey = nameKey
	folder.UpdatedAt = time.Now().UTC()
	if err := s.repo.UpdateAssetFolder(folder); err != nil {
		return model.AssetFolder{}, err
	}
	return *folder, nil
}

func (s *Service) DeleteAssetFolder(userID string, folderID string) error {
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	err := s.repo.DeleteAssetFolder(userID, strings.TrimSpace(folderID))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return BadAuthRequest("素材分类不存在")
	}
	return err
}

func (s *Service) MoveUserAssetsToFolder(userID string, req MoveUserAssetsRequest) error {
	ids := uniqueNonemptyStrings(req.AssetIDs)
	if len(ids) == 0 {
		return BadAuthRequest("请选择要移动的素材")
	}
	if len(ids) > 200 {
		return BadAuthRequest("一次最多移动 200 个素材")
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	folderID := strings.TrimSpace(req.FolderID)
	if folderID != "" {
		if _, err := s.repo.AssetFolderForUser(userID, folderID); err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return BadAuthRequest("目标素材分类不存在")
			}
			return err
		}
	}
	if err := s.repo.MoveUserAssetsToFolder(userID, ids, folderID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return BadAuthRequest("部分素材不存在或不属于当前用户")
		}
		return err
	}
	return nil
}

func normalizeAssetFolderName(value string) (string, string, error) {
	name := strings.TrimSpace(value)
	if name == "" {
		return "", "", BadAuthRequest("请输入素材分类名称")
	}
	if utf8.RuneCountInString(name) > 40 {
		return "", "", BadAuthRequest("素材分类名称不能超过 40 个字符")
	}
	return name, strings.ToLower(name), nil
}

func uniqueNonemptyStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}
