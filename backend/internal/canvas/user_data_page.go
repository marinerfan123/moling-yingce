package canvas

import (
	"encoding/json"
	"infinite-canvas/backend/internal/kernel"
	"infinite-canvas/backend/internal/model"
	"sort"
	"strings"
	"time"
)

func (s *Service) UserAssetsByIDs(userID string, ids []string) ([]json.RawMessage, error) {
	if len(ids) > 100 {
		return nil, kernel.BadAuthRequest("每次最多读取 100 个素材")
	}
	unique := make([]string, 0, len(ids))
	seen := make(map[string]bool, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" || len(id) > 80 {
			return nil, kernel.BadAuthRequest("素材 ID 无效")
		}
		if !seen[id] {
			seen[id] = true
			unique = append(unique, id)
		}
	}
	assets, err := s.repo.AssetsForUserIDs(userID, unique)
	if err != nil {
		return nil, err
	}
	allowed, err := s.desktopLocalToolsAllowed(userID)
	if err != nil {
		return nil, err
	}
	result := make([]json.RawMessage, 0, len(assets))
	for _, asset := range assets {
		if !allowed && IsDesktopLocalAsset(asset) {
			continue
		}
		if payload := ClientAssetPayload(asset); len(payload) > 0 {
			result = append(result, payload)
		}
	}
	return result, nil
}

type CanvasLibrarySummary struct {
	ID           string           `json:"id"`
	ProjectID    string           `json:"projectId,omitempty"`
	Title        string           `json:"title"`
	CreatedAt    time.Time        `json:"createdAt"`
	UpdatedAt    time.Time        `json:"updatedAt"`
	NodeCount    int              `json:"nodeCount"`
	PreviewNodes []map[string]any `json:"previewNodes"`
}

type CanvasLibraryPage struct {
	Projects []CanvasLibrarySummary `json:"projects"`
	Page     int                    `json:"page"`
	PageSize int                    `json:"pageSize"`
	Total    int64                  `json:"total"`
	HasMore  bool                   `json:"hasMore"`
}

func (s *Service) UserCanvasProjectsPage(userID string, page int, pageSize int, projectID string, search string, sortOrder string) (CanvasLibraryPage, error) {
	if page < 1 {
		page = 1
	}
	if page > 1000000 {
		return CanvasLibraryPage{}, kernel.BadAuthRequest("页码超出范围")
	}
	if pageSize < 1 {
		pageSize = 40
	}
	if pageSize > 50 {
		pageSize = 50
	}
	projects, err := s.repo.CanvasProjects(userID)
	if err != nil {
		return CanvasLibraryPage{}, err
	}
	allowed, err := s.desktopLocalToolsAllowed(userID)
	if err != nil {
		return CanvasLibraryPage{}, err
	}
	type visibleProject struct {
		project model.CanvasProject
		payload string
		nodes   int
	}
	visible := make([]visibleProject, 0, len(projects))
	for _, project := range projects {
		if projectID == "independent" && strings.TrimSpace(project.ProjectID) != "" {
			continue
		}
		if projectID != "" && projectID != "all" && projectID != "independent" && project.ProjectID != projectID {
			continue
		}
		if query := strings.ToLower(strings.TrimSpace(search)); query != "" && !strings.Contains(strings.ToLower(project.Title), query) {
			continue
		}
		payload, onlyLocal, filterErr := s.filteredCanvasPayloadWithPermission(allowed, project.PayloadJSON)
		if filterErr != nil {
			return CanvasLibraryPage{}, filterErr
		}
		if onlyLocal {
			continue
		}
		var document struct{ Nodes []map[string]any `json:"nodes"` }
		if err := json.Unmarshal([]byte(payload), &document); err != nil {
			return CanvasLibraryPage{}, err
		}
		visible = append(visible, visibleProject{project: project, payload: payload, nodes: len(document.Nodes)})
	}
	sort.SliceStable(visible, func(left, right int) bool {
		if sortOrder == "name" {
			if visible[left].project.Title != visible[right].project.Title {
				return visible[left].project.Title < visible[right].project.Title
			}
		} else if sortOrder == "nodes" && visible[left].nodes != visible[right].nodes {
			return visible[left].nodes > visible[right].nodes
		} else if !visible[left].project.UpdatedAt.Equal(visible[right].project.UpdatedAt) {
			return visible[left].project.UpdatedAt.After(visible[right].project.UpdatedAt)
		}
		return visible[left].project.ID < visible[right].project.ID
	})
	total := int64(len(visible))
	start := (page - 1) * pageSize
	if start > len(visible) {
		start = len(visible)
	}
	end := start + pageSize
	if end > len(visible) {
		end = len(visible)
	}
	result := CanvasLibraryPage{Projects: make([]CanvasLibrarySummary, 0, end-start), Page: page, PageSize: pageSize, Total: total, HasMore: int64(page)*int64(pageSize) < total}
	for _, item := range visible[start:end] {
		project := item.project
		var document struct {
			Nodes []map[string]any `json:"nodes"`
		}
		if err := json.Unmarshal([]byte(item.payload), &document); err != nil {
			return CanvasLibraryPage{}, err
		}
		preview := make([]map[string]any, 0, 4)
		for _, node := range document.Nodes {
			if len(preview) == 4 {
				break
			}
			if node["type"] != "image" && node["type"] != "video" {
				continue
			}
			item := map[string]any{"position": map[string]int{"x": 0, "y": 0}}
			for _, key := range []string{"id", "type", "title"} {
				if value, ok := node[key].(string); ok {
					item[key] = string([]rune(value)[:min(len([]rune(value)), 256)])
				}
			}
			for _, key := range []string{"width", "height"} {
				if value, ok := node[key].(float64); ok {
					item[key] = value
				}
			}
			metadata := map[string]any{}
			if original, ok := node["metadata"].(map[string]any); ok {
				if key, ok := original["storageKey"].(string); ok && len(key) <= 512 {
					metadata["storageKey"] = key
				}
			}
			item["metadata"] = metadata
			preview = append(preview, item)
		}
		result.Projects = append(result.Projects, CanvasLibrarySummary{ID: project.ID, ProjectID: project.ProjectID, Title: project.Title, CreatedAt: project.CreatedAt, UpdatedAt: project.UpdatedAt, NodeCount: len(document.Nodes), PreviewNodes: preview})
	}
	return result, nil
}
