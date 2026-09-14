package canvas

import (
	"encoding/json"
	"infinite-canvas/backend/internal/model"
	"strings"
)

const (
	desktopLocalDreaminaTaskIDPrefix = "dreamina:"
	desktopLocalDreaminaModelPrefix  = "local:dreamina-cli:"
)

// isDesktopLocalCanvasNodeValue mirrors the browser policy for JSON payloads
// that are serialized before a CanvasNodeData value is available.
func IsDesktopLocalCanvasNodeValue(node map[string]any) bool {
	if node == nil {
		return false
	}
	nodeType, _ := node["type"].(string)
	if nodeType == "media-conversion" || nodeType == "portrait-clearance" {
		return true
	}
	metadata, _ := node["metadata"].(map[string]any)
	pluginID, _ := metadata["pluginId"].(string)
	if pluginID == "eagle-asset-connector" || pluginID == "portrait-clearance" || pluginID == "media-conversion" || pluginID == "comfyui-workflow-provider" {
		return true
	}
	workflowProvider, _ := metadata["workflowProvider"].(string)
	if workflowProvider == "comfyui" || strings.TrimSpace(stringValue(metadata["comfyBridgeWorkflowId"])) != "" {
		return true
	}
	taskProvider, _ := metadata["taskProvider"].(string)
	if taskProvider == "dreamina-cli" {
		return true
	}
	if strings.HasPrefix(strings.TrimSpace(stringValue(metadata["taskId"])), desktopLocalDreaminaTaskIDPrefix) {
		return true
	}
	return strings.HasPrefix(strings.TrimSpace(stringValue(metadata["model"])), desktopLocalDreaminaModelPrefix)
}

func isDesktopLocalCanvasNodeValue(node map[string]any) bool {
	return IsDesktopLocalCanvasNodeValue(node)
}

// IsDesktopLocalAsset identifies assets produced by desktop-only integrations.
// A generic local Resource is deliberately not enough: ordinary uploads are
// also stored by the local storage provider.
func IsDesktopLocalAsset(asset model.Asset) bool {
	var payload map[string]any
	if err := json.Unmarshal([]byte(asset.PayloadJSON), &payload); err != nil || payload == nil {
		return false
	}
	for _, value := range []any{payload, payload["metadata"], payload["data"]} {
		if fields, ok := value.(map[string]any); ok && isDesktopLocalMarkerMap(fields) {
			return true
		}
	}
	return false
}

func isDesktopLocalMarkerMap(fields map[string]any) bool {
	if fields == nil {
		return false
	}
	source := strings.ToLower(strings.TrimSpace(stringValue(fields["source"])))
	if source == "eagle" || strings.HasPrefix(source, "eagle:") || source == "eagle-library" {
		return true
	}
	if _, ok := fields["eagle"]; ok {
		return true
	}
	pluginID := strings.TrimSpace(stringValue(fields["pluginId"]))
	if pluginID == "eagle-asset-connector" || pluginID == "portrait-clearance" || pluginID == "media-conversion" || pluginID == "comfyui-workflow-provider" {
		return true
	}
	workflowProvider := strings.ToLower(strings.TrimSpace(stringValue(fields["workflowProvider"])))
	if workflowProvider == "comfyui" || strings.TrimSpace(stringValue(fields["comfyBridgeWorkflowId"])) != "" {
		return true
	}
	if strings.EqualFold(strings.TrimSpace(stringValue(fields["taskProvider"])), "dreamina-cli") {
		return true
	}
	if strings.HasPrefix(strings.TrimSpace(stringValue(fields["taskId"])), desktopLocalDreaminaTaskIDPrefix) || strings.HasPrefix(strings.TrimSpace(stringValue(fields["model"])), desktopLocalDreaminaModelPrefix) {
		return true
	}
	return false
}

// IsDesktopLocalTask covers both legacy task columns and the persisted input
// shape used by newer providers.
func IsDesktopLocalTask(task model.Task) bool {
	if task.Provider == "dreamina-cli" || strings.HasPrefix(strings.TrimSpace(task.ID), desktopLocalDreaminaTaskIDPrefix) || strings.HasPrefix(strings.TrimSpace(task.Model), desktopLocalDreaminaModelPrefix) {
		return true
	}
	var input map[string]any
	if json.Unmarshal([]byte(task.InputJSON), &input) == nil {
		if isDesktopLocalMarkerMap(input) {
			return true
		}
		if config, ok := input["config"].(map[string]any); ok {
			if allow, ok := config["allowLocalChannel"].(bool); ok && allow {
				return true
			}
			interfaceType := strings.ToLower(strings.TrimSpace(stringValue(config["interfaceType"])))
			if strings.Contains(interfaceType, "comfyui") || strings.Contains(interfaceType, "comfy-bridge") {
				return true
			}
			if isDesktopLocalMarkerMap(config) {
				return true
			}
		}
	}
	return false
}

// IsDesktopLocalOnlyCanvasPayload reports whether a canvas would be empty for
// an ordinary user after local nodes are removed.
func IsDesktopLocalOnlyCanvasPayload(raw string) (bool, error) {
	var source map[string]any
	if err := json.Unmarshal([]byte(raw), &source); err != nil {
		return false, err
	}
	rawNodes, _ := source["nodes"].([]any)
	if len(rawNodes) == 0 {
		return false, nil
	}
	for _, rawNode := range rawNodes {
		node, _ := rawNode.(map[string]any)
		if node != nil && !IsDesktopLocalCanvasNodeValue(node) {
			return false, nil
		}
	}
	return true, nil
}

func CanvasPayloadContainsDesktopLocalNode(raw string) (bool, error) {
	var source map[string]any
	if err := json.Unmarshal([]byte(raw), &source); err != nil {
		return false, err
	}
	rawNodes, _ := source["nodes"].([]any)
	for _, rawNode := range rawNodes {
		node, _ := rawNode.(map[string]any)
		if node != nil && IsDesktopLocalCanvasNodeValue(node) {
			return true, nil
		}
	}
	return false, nil
}

// filterCanvasPayload creates an ordinary-user view without mutating the
// persisted project, including removing broken parent and connection links.
func FilterCanvasPayload(raw string, allowDesktopLocalTools bool) (string, error) {
	if allowDesktopLocalTools {
		return raw, nil
	}
	var source map[string]any
	if err := json.Unmarshal([]byte(raw), &source); err != nil {
		return "", err
	}
	rawNodes, _ := source["nodes"].([]any)
	visibleNodes := make([]any, 0, len(rawNodes))
	visibleNodeIDs := make(map[string]bool, len(rawNodes))
	for _, rawNode := range rawNodes {
		node, _ := rawNode.(map[string]any)
		if node == nil || IsDesktopLocalCanvasNodeValue(node) {
			continue
		}
		id := strings.TrimSpace(stringValue(node["id"]))
		if id == "" {
			continue
		}
		visibleNodeIDs[id] = true
		visibleNodes = append(visibleNodes, node)
	}
	for _, rawNode := range visibleNodes {
		node, _ := rawNode.(map[string]any)
		parentID := strings.TrimSpace(stringValue(node["parentId"]))
		if parentID != "" && !visibleNodeIDs[parentID] {
			delete(node, "parentId")
		}
	}
	connections, _ := source["connections"].([]any)
	visibleConnections := make([]any, 0, len(connections))
	for _, rawConnection := range connections {
		connection, _ := rawConnection.(map[string]any)
		if connection == nil || !visibleNodeIDs[strings.TrimSpace(stringValue(connection["fromNodeId"]))] || !visibleNodeIDs[strings.TrimSpace(stringValue(connection["toNodeId"]))] {
			continue
		}
		visibleConnections = append(visibleConnections, connection)
	}
	if _, ok := source["nodes"]; ok {
		source["nodes"] = visibleNodes
	}
	if _, ok := source["connections"]; ok {
		source["connections"] = visibleConnections
	}
	encoded, err := json.Marshal(source)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}

func filterCanvasPayload(raw string, allowDesktopLocalTools bool) (string, error) {
	return FilterCanvasPayload(raw, allowDesktopLocalTools)
}

func stringValue(value any) string {
	if value == nil {
		return ""
	}
	text, _ := value.(string)
	return text
}
