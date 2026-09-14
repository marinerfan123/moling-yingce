package app

import (
	"strings"

	"infinite-canvas/backend/internal/canvas"
	"infinite-canvas/backend/internal/model"

	"golang.org/x/sync/errgroup"
)

type ProjectCore struct {
	Project model.Project `json:"project"`
}

type ProjectUnitSummaries struct {
	Units        []model.ProjectUnit `json:"units"`
	CanvasCounts map[string]int64    `json:"canvasCounts"`
}

type ProjectOverview struct {
	Metrics ProjectOverviewMetrics `json:"metrics"`
	Units   []ProjectOverviewUnit  `json:"units"`
}

type ProjectOverviewMetrics struct {
	UnitCount             int64 `json:"unitCount"`
	CompletedUnitCount    int64 `json:"completedUnitCount"`
	TotalWordCount        int64 `json:"totalWordCount"`
	UnitsWithoutText      int64 `json:"unitsWithoutText"`
	UnitsWithoutShots     int64 `json:"unitsWithoutShots"`
	CanvasCount           int64 `json:"canvasCount"`
	AssetCount            int64 `json:"assetCount"`
	ShotCount             int64 `json:"shotCount"`
	PendingCandidateCount int64 `json:"pendingCandidateCount"`
	ReadyStoryboardCount  int64 `json:"readyStoryboardCount"`
	ReadyPrevizCount      int64 `json:"readyPrevizCount"`
	ReadyVideoCount       int64 `json:"readyVideoCount"`
	RenderSucceededCount  int64 `json:"renderSucceededCount"`
	StaleArtifactCount    int64 `json:"staleArtifactCount"`
}

type ProjectOverviewUnit struct {
	Unit           model.ProjectUnit `json:"unit"`
	ShotCount      int64             `json:"shotCount"`
	CandidateCount int64             `json:"candidateCount"`
	CanvasCount    int64             `json:"canvasCount"`
}

type ProjectUnitWorkspace struct {
	Unit            model.ProjectUnit             `json:"unit"`
	Workflows       []ProjectWorkflowDetail       `json:"workflows"`
	Shots           []model.Shot                  `json:"shots"`
	ShotRevisions   []model.ShotRevision          `json:"shotRevisions"`
	ShotArtifacts   []model.ShotArtifact          `json:"shotArtifacts"`
	ShotReferences  []ProjectShotAssetReference   `json:"shotReferences"`
	AssetCandidates []model.ProjectAssetCandidate `json:"assetCandidates"`
	Assets          []ProjectAssetSummary         `json:"assets"`
	Tasks           []TaskSummary                 `json:"tasks"`
}

// ProjectShotAssetReference keeps the immutable visual version selected by the
// shot while also exposing the asset's current card configuration (notably its
// voice binding) for generation-time prompt assembly.
type ProjectShotAssetReference struct {
	model.ShotAssetReference
	Asset             ProjectAssetSummary              `json:"asset"`
	ReferencedVersion ProjectShotAssetReferenceVersion `json:"referencedVersion"`
}

type ProjectShotAssetReferenceVersion struct {
	ID              string                           `json:"id"`
	AssetID         string                           `json:"assetId"`
	Version         int                              `json:"version"`
	Representations []CharacterRepresentationSummary `json:"representations"`
}

type ProjectCanvasPage struct {
	Canvases        []model.CanvasProject  `json:"canvases"`
	CanvasUnitLinks []model.CanvasUnitLink `json:"canvasUnitLinks"`
	Page            int                    `json:"page"`
	PageSize        int                    `json:"pageSize"`
	Total           int64                  `json:"total"`
	HasMore         bool                   `json:"hasMore"`
}

type ProjectAssetCandidatePage struct {
	Candidates []model.ProjectAssetCandidate `json:"candidates"`
	Page       int                           `json:"page"`
	PageSize   int                           `json:"pageSize"`
	Total      int64                         `json:"total"`
	HasMore    bool                          `json:"hasMore"`
}

type ProjectAssetPage struct {
	Assets         []ProjectAssetSummary `json:"assets"`
	CategoryCounts map[string]int64      `json:"categoryCounts"`
	FolderCounts   map[string]int64      `json:"folderCounts"`
	Page           int                   `json:"page"`
	PageSize       int                   `json:"pageSize"`
	Total          int64                 `json:"total"`
	HasMore        bool                  `json:"hasMore"`
}

func (s *Service) visibleProjectCanvasDocuments(userID string, projectID string) ([]model.CanvasProject, error) {
	documents, err := s.repo.ProjectCanvasDocuments(userID, projectID)
	if err != nil {
		return nil, err
	}
	allowed, err := s.desktopLocalToolsAllowedForUserID(userID)
	if err != nil {
		return nil, err
	}
	visible := make([]model.CanvasProject, 0, len(documents))
	for _, document := range documents {
		payload, onlyLocal, filterErr := filterCanvasDocumentForPermission(document.PayloadJSON, allowed)
		if filterErr != nil {
			return nil, filterErr
		}
		if onlyLocal {
			continue
		}
		document.PayloadJSON = payload
		visible = append(visible, document)
	}
	return visible, nil
}

func filterCanvasDocumentForPermission(raw string, allowed bool) (string, bool, error) {
	if allowed || strings.TrimSpace(raw) == "" {
		return raw, false, nil
	}
	onlyLocal, err := canvas.IsDesktopLocalOnlyCanvasPayload(raw)
	if err != nil {
		return "", false, err
	}
	if onlyLocal {
		return "", true, nil
	}
	filtered, err := canvas.FilterCanvasPayload(raw, false)
	return filtered, false, err
}

func canvasSummary(document model.CanvasProject) model.CanvasProject {
	document.PayloadJSON = ""
	return document
}

func (s *Service) ProjectCore(userID string, projectID string) (ProjectCore, error) {
	project, err := s.repo.ProjectForUser(userID, projectID)
	if err != nil {
		return ProjectCore{}, err
	}
	if s.reconcileCharacterTurnaroundTasks(userID, project.ID) {
		project, err = s.repo.ProjectForUser(userID, projectID)
		if err != nil {
			return ProjectCore{}, err
		}
	}
	visible, err := s.sanitizeProjectForUser(userID, *project)
	if err != nil {
		return ProjectCore{}, err
	}
	return ProjectCore{Project: visible}, nil
}

func (s *Service) ProjectUnitSummaries(userID string, projectID string) (ProjectUnitSummaries, error) {
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return ProjectUnitSummaries{}, err
	}
	var units []model.ProjectUnit
	var canvasCounts map[string]int64
	var group errgroup.Group
	group.Go(func() error {
		var err error
		units, err = s.repo.ProjectUnitSummaries(projectID)
		return err
	})
	group.Go(func() error {
		canvases, err := s.visibleProjectCanvasDocuments(userID, projectID)
		if err != nil {
			return err
		}
		ids := make([]string, 0, len(canvases))
		for _, item := range canvases {
			ids = append(ids, item.ID)
		}
		links, err := s.repo.ProjectCanvasUnitLinksForCanvases(projectID, ids)
		if err != nil {
			return err
		}
		canvasCounts = make(map[string]int64)
		for _, link := range links {
			canvasCounts[link.UnitID]++
		}
		return nil
	})
	if err := group.Wait(); err != nil {
		return ProjectUnitSummaries{}, err
	}
	return ProjectUnitSummaries{Units: units, CanvasCounts: canvasCounts}, nil
}

func (s *Service) ProjectOverview(userID string, projectID string) (ProjectOverview, error) {
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return ProjectOverview{}, err
	}
	var metrics ProjectOverviewMetrics
	var units []ProjectOverviewUnit
	var group errgroup.Group
	group.Go(func() error {
		row, err := s.repo.ProjectOverviewMetrics(projectID)
		if err != nil {
			return err
		}
		metrics = ProjectOverviewMetrics{
			UnitCount: row.UnitCount, CompletedUnitCount: row.CompletedUnitCount, TotalWordCount: row.TotalWordCount,
			UnitsWithoutText: row.UnitsWithoutText, UnitsWithoutShots: row.UnitsWithoutShots, CanvasCount: row.CanvasCount,
			AssetCount: row.AssetCount, ShotCount: row.ShotCount, PendingCandidateCount: row.PendingCandidateCount,
			ReadyStoryboardCount: row.ReadyStoryboardCount, ReadyPrevizCount: row.ReadyPrevizCount, ReadyVideoCount: row.ReadyVideoCount,
			RenderSucceededCount: row.TimelineRenderSucceededCount, StaleArtifactCount: row.StaleArtifactCount,
		}
		return nil
	})
	group.Go(func() error {
		rows, err := s.repo.ProjectOverviewUnits(projectID, 8)
		if err != nil {
			return err
		}
		units = make([]ProjectOverviewUnit, 0, len(rows))
		for _, row := range rows {
			units = append(units, ProjectOverviewUnit{Unit: row.ProjectUnit, ShotCount: row.ShotCount, CandidateCount: row.CandidateCount, CanvasCount: row.CanvasCount})
		}
		return nil
	})
	if err := group.Wait(); err != nil {
		return ProjectOverview{}, err
	}
	canvases, err := s.visibleProjectCanvasDocuments(userID, projectID)
	if err != nil {
		return ProjectOverview{}, err
	}
	assets, err := s.ProjectAssets(userID, projectID)
	if err != nil {
		return ProjectOverview{}, err
	}
	metrics.CanvasCount = int64(len(canvases))
	metrics.AssetCount = int64(len(assets))
	visibleCanvasIDs := make(map[string]struct{}, len(canvases))
	for _, item := range canvases {
		visibleCanvasIDs[item.ID] = struct{}{}
	}
	links, err := s.repo.ProjectCanvasUnitLinks(projectID)
	if err != nil {
		return ProjectOverview{}, err
	}
	canvasCounts := make(map[string]int64)
	for _, link := range links {
		if _, ok := visibleCanvasIDs[link.CanvasID]; ok {
			canvasCounts[link.UnitID]++
		}
	}
	for index := range units {
		units[index].CanvasCount = canvasCounts[units[index].Unit.ID]
	}
	return ProjectOverview{Metrics: metrics, Units: units}, nil
}

func (s *Service) ProjectUnitWorkspace(userID string, projectID string, unitID string) (ProjectUnitWorkspace, error) {
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return ProjectUnitWorkspace{}, err
	}
	unit, err := s.repo.ProjectUnit(projectID, unitID)
	if err != nil {
		return ProjectUnitWorkspace{}, err
	}
	result := ProjectUnitWorkspace{Unit: *unit}
	var projectTasks []TaskSummary
	var shotReferences []model.ShotAssetReference
	var group errgroup.Group
	group.Go(func() error {
		var err error
		result.Shots, err = s.repo.ProjectUnitShots(projectID, unitID)
		return err
	})
	group.Go(func() error {
		var err error
		result.ShotRevisions, err = s.repo.ProjectUnitShotRevisions(projectID, unitID)
		return err
	})
	group.Go(func() error {
		var err error
		result.ShotArtifacts, err = s.repo.ProjectUnitShotArtifacts(projectID, unitID)
		return err
	})
	group.Go(func() error {
		var err error
		shotReferences, err = s.repo.ProjectUnitShotAssetReferences(projectID, unitID)
		return err
	})
	group.Go(func() error {
		var err error
		result.AssetCandidates, err = s.repo.ProjectUnitAssetCandidates(projectID, unitID)
		return err
	})
	group.Go(func() error {
		assets, err := s.repo.ProjectUnitAssets(userID, projectID, unitID)
		if err != nil {
			return err
		}
		allowed, allowedErr := s.desktopLocalToolsAllowedForUserID(userID)
		if allowedErr != nil {
			return allowedErr
		}
		visibleAssets := make([]model.Asset, 0, len(assets))
		for _, asset := range assets {
			if !allowed && canvas.IsDesktopLocalAsset(asset) {
				continue
			}
			visibleAssets = append(visibleAssets, asset)
		}
		result.Assets = make([]ProjectAssetSummary, len(visibleAssets))
		var summaries errgroup.Group
		summaries.SetLimit(8)
		for index := range visibleAssets {
			index := index
			summaries.Go(func() error {
				summary, summaryErr := s.projectAssetSummary(userID, projectID, &visibleAssets[index])
				if summaryErr == nil {
					result.Assets[index] = summary
				}
				return summaryErr
			})
		}
		return summaries.Wait()
	})
	group.Go(func() error {
		instances, err := s.repo.ProjectWorkflowInstancesForUnit(projectID, unitID)
		if err != nil {
			return err
		}
		result.Workflows = make([]ProjectWorkflowDetail, 0, len(instances))
		for _, instance := range instances {
			steps, stepsErr := s.repo.WorkflowSteps(instance.ID)
			if stepsErr != nil {
				return stepsErr
			}
			result.Workflows = append(result.Workflows, ProjectWorkflowDetail{Instance: instance, Steps: steps})
		}
		return nil
	})
	group.Go(func() error {
		recent, err := s.TasksWithOptions(userID, TaskListOptions{Limit: 100, ProjectID: projectID})
		if err != nil {
			return err
		}
		active, err := s.TasksWithOptions(userID, TaskListOptions{Limit: 100, ProjectID: projectID, ActiveOnly: true})
		if err != nil {
			return err
		}
		seen := make(map[string]struct{}, len(recent)+len(active))
		projectTasks = make([]TaskSummary, 0, len(recent)+len(active))
		for _, task := range append(active, recent...) {
			if _, exists := seen[task.ID]; exists {
				continue
			}
			seen[task.ID] = struct{}{}
			projectTasks = append(projectTasks, task)
		}
		return nil
	})
	if err := group.Wait(); err != nil {
		return ProjectUnitWorkspace{}, err
	}
	assetByID := make(map[string]ProjectAssetSummary, len(result.Assets))
	for _, asset := range result.Assets {
		assetByID[asset.ID] = asset
	}
	versionIDs := make([]string, 0, len(shotReferences))
	for _, reference := range shotReferences {
		versionIDs = append(versionIDs, reference.AssetVersionID)
	}
	versions, err := s.repo.ProjectAssetVersionsByIDs(projectID, versionIDs)
	if err != nil {
		return ProjectUnitWorkspace{}, err
	}
	visibleVersionIDs := make([]string, 0, len(versions))
	for _, version := range versions {
		if _, ok := assetByID[version.AssetID]; ok {
			visibleVersionIDs = append(visibleVersionIDs, version.ID)
		}
	}
	storedRepresentations, err := s.repo.AssetRepresentationsByVersionIDs(visibleVersionIDs)
	if err != nil {
		return ProjectUnitWorkspace{}, err
	}
	versionByID := make(map[string]model.AssetVersion, len(versions))
	for _, version := range versions {
		versionByID[version.ID] = version
	}
	representationsByVersionID := make(map[string][]CharacterRepresentationSummary, len(versionIDs))
	for _, representation := range storedRepresentations {
		representationsByVersionID[representation.AssetVersionID] = append(representationsByVersionID[representation.AssetVersionID], CharacterRepresentationSummary{
			ID: representation.ID, ResourceID: representation.ResourceID, MediaType: representation.MediaType, Role: representation.Role,
		})
	}
	result.ShotReferences = make([]ProjectShotAssetReference, 0, len(shotReferences))
	for _, reference := range shotReferences {
		version, exists := versionByID[reference.AssetVersionID]
		if !exists {
			return ProjectUnitWorkspace{}, BadAuthRequest("镜头引用的资产版本不可用")
		}
		asset, exists := assetByID[version.AssetID]
		if !exists {
			continue
		}
		representations := representationsByVersionID[version.ID]
		if representations == nil {
			representations = []CharacterRepresentationSummary{}
		}
		result.ShotReferences = append(result.ShotReferences, ProjectShotAssetReference{
			ShotAssetReference: reference,
			Asset:              asset,
			ReferencedVersion: ProjectShotAssetReferenceVersion{
				ID: version.ID, AssetID: version.AssetID, Version: version.Version, Representations: representations,
			},
		})
	}
	shotIDs := make(map[string]struct{}, len(result.Shots))
	for _, shot := range result.Shots {
		shotIDs[shot.ID] = struct{}{}
	}
	result.Tasks = make([]TaskSummary, 0, len(projectTasks))
	for _, task := range projectTasks {
		context := task.ClientContext
		if context == nil {
			continue
		}
		_, belongsToShot := shotIDs[context.ShotID]
		if context.ChapterID == unitID || belongsToShot {
			result.Tasks = append(result.Tasks, task)
		}
	}
	return result, nil
}

func (s *Service) ProjectCanvasesPage(userID string, projectID string, page int, pageSize int) (ProjectCanvasPage, error) {
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return ProjectCanvasPage{}, err
	}
	page, pageSize = normalizeProjectPage(page, pageSize, 100)
	visibleDocuments, err := s.visibleProjectCanvasDocuments(userID, projectID)
	if err != nil {
		return ProjectCanvasPage{}, err
	}
	total := int64(len(visibleDocuments))
	start := (page - 1) * pageSize
	if start > len(visibleDocuments) {
		start = len(visibleDocuments)
	}
	end := start + pageSize
	if end > len(visibleDocuments) {
		end = len(visibleDocuments)
	}
	canvases := make([]model.CanvasProject, 0, end-start)
	for _, document := range visibleDocuments[start:end] {
		canvases = append(canvases, canvasSummary(document))
	}
	ids := make([]string, 0, len(canvases))
	for _, canvas := range canvases {
		ids = append(ids, canvas.ID)
	}
	links, err := s.repo.ProjectCanvasUnitLinksForCanvases(projectID, ids)
	if err != nil {
		return ProjectCanvasPage{}, err
	}
	return ProjectCanvasPage{Canvases: canvases, CanvasUnitLinks: links, Page: page, PageSize: pageSize, Total: total, HasMore: int64(page*pageSize) < total}, nil
}

func (s *Service) ProjectAssetCandidatesPage(userID string, projectID string, page int, pageSize int, unitID string, status string, category string, query string) (ProjectAssetCandidatePage, error) {
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return ProjectAssetCandidatePage{}, err
	}
	page, pageSize = normalizeProjectPage(page, pageSize, 200)
	candidates, total, err := s.repo.ProjectAssetCandidatesPage(projectID, page, pageSize, unitID, status, category, query)
	if err != nil {
		return ProjectAssetCandidatePage{}, err
	}
	return ProjectAssetCandidatePage{Candidates: candidates, Page: page, PageSize: pageSize, Total: total, HasMore: int64(page*pageSize) < total}, nil
}

func (s *Service) ProjectAssetsPage(userID string, projectID string, page int, pageSize int, category string, mediaType string, status string, folderID *string, query string) (ProjectAssetPage, error) {
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return ProjectAssetPage{}, err
	}
	page, pageSize = normalizeProjectPage(page, pageSize, 80)
	allAssets, err := s.ProjectAssets(userID, projectID)
	if err != nil {
		return ProjectAssetPage{}, err
	}
	filtered := make([]ProjectAssetSummary, 0, len(allAssets))
	for _, asset := range allAssets {
		if value := strings.TrimSpace(category); value != "" && string(asset.Category) != value {
			continue
		}
		if value := strings.TrimSpace(mediaType); value != "" && asset.MediaType != value {
			continue
		}
		if value := strings.TrimSpace(status); value != "" && string(asset.Status) != value {
			continue
		}
		if folderID != nil && asset.FolderID != strings.TrimSpace(*folderID) {
			continue
		}
		if value := strings.ToLower(strings.TrimSpace(query)); value != "" && !strings.Contains(strings.ToLower(asset.Title), value) {
			continue
		}
		filtered = append(filtered, asset)
	}
	total := int64(len(filtered))
	start := (page - 1) * pageSize
	if start > len(filtered) {
		start = len(filtered)
	}
	end := start + pageSize
	if end > len(filtered) {
		end = len(filtered)
	}
	categoryCounts := make(map[string]int64)
	folderCounts := make(map[string]int64)
	for _, asset := range allAssets {
		categoryCounts[string(asset.Category)]++
		folderCounts[asset.FolderID]++
	}
	return ProjectAssetPage{Assets: filtered[start:end], CategoryCounts: categoryCounts, FolderCounts: folderCounts, Page: page, PageSize: pageSize, Total: total, HasMore: int64(page*pageSize) < total}, nil
}

func normalizeProjectPage(page int, pageSize int, maximum int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 40
	}
	if pageSize > maximum {
		pageSize = maximum
	}
	return page, pageSize
}
