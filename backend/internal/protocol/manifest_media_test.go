package protocol

import (
	"context"
	"testing"
)

func TestManifestImageB64JSONBecomesDataURL(t *testing.T) {
	manifest := []byte(`{
		"apiVersion":"yingce.plugin/v1",
		"id":"image-b64-test","version":"1.0.0","name":"Image B64 Test","author":"Test","documentation":"# Image B64 Test",
		"contributes":{"providers":[{"id":"image-b64-test","label":"Image B64 Test","capabilities":["image"],"scopes":["canvas"],"create":{"method":"POST","path":"/images"},"response":{"status":"succeeded","images":{"$ref":"response.data"}}}]}
	}`)
	adapter, err := LoadManifest(manifest)
	if err != nil {
		t.Fatal(err)
	}
	result, err := adapter.ParseCreate(context.Background(), []byte(`{"data":[{"b64_json":"aW1hZ2U="}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if result.Result == nil || len(result.Result.Images) != 1 {
		t.Fatalf("result = %#v", result)
	}
	if got := result.Result.Images[0].DataURL; got != "data:image/png;base64,aW1hZ2U=" {
		t.Fatalf("data URL = %q", got)
	}
}
