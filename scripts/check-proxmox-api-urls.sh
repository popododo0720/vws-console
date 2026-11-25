#!/usr/bin/env bash
# Runs the console's PVE API URL fixtures (src/lib/vws-api/testdata/proxmox-api-urls.json) against the Go rules they copy
# in a vws-console-api checkout: "checks" against resource.CheckPVEAPIURLs and "destinations" against the proxmox
# endpointKey that decides whether a stored secret may be reused. The test files are removed again on exit.
set -euo pipefail
api=$(cd "${1:-${VWS_CONSOLE_API_DIR:?usage: $0 VWS_CONSOLE_API_DIR}}" && pwd)
fixture=$(cd "$(dirname "$0")/.." && pwd)/src/lib/vws-api/testdata/proxmox-api-urls.json
# Absolute paths and fresh names: the cleanup runs after the cd below and never touches a file it did not create.
resource=
proxmox=
trap 'rm -f "$resource" "$proxmox"' EXIT
resource=$(mktemp --suffix=_test.go "$api/internal/resource/zz_console_fixture_XXXXXX")
proxmox=$(mktemp --suffix=_test.go "$api/internal/backend/proxmox/zz_console_fixture_XXXXXX")
cat > "$resource" <<'GO'
package resource

import (
	"encoding/json"
	"os"
	"testing"
)

func TestConsolePVEAPIURLFixture(t *testing.T) {
	var f struct {
		Checks []struct {
			URLs []string `json:"urls"`
			OK   bool     `json:"ok"`
		} `json:"checks"`
	}
	b, err := os.ReadFile(os.Getenv("CONSOLE_FIXTURE"))
	if err != nil || json.Unmarshal(b, &f) != nil || len(f.Checks) == 0 {
		t.Fatalf("read fixture: %v", err)
	}
	for _, c := range f.Checks {
		if err := CheckPVEAPIURLs(c.URLs); (err == nil) != c.OK {
			t.Errorf("CheckPVEAPIURLs(%q) = %v, fixture says ok=%v", c.URLs, err, c.OK)
		}
	}
}
GO
cat > "$proxmox" <<'GO'
package proxmox

import (
	"encoding/json"
	"os"
	"testing"
)

func TestConsoleEndpointKeyFixture(t *testing.T) {
	var f struct {
		Destinations []struct {
			Stored string `json:"stored"`
			Sent   string `json:"sent"`
			Same   bool   `json:"same"`
		} `json:"destinations"`
	}
	b, err := os.ReadFile(os.Getenv("CONSOLE_FIXTURE"))
	if err != nil || json.Unmarshal(b, &f) != nil || len(f.Destinations) == 0 {
		t.Fatalf("read fixture: %v", err)
	}
	for _, d := range f.Destinations {
		if same := endpointKey(d.Stored) == endpointKey(d.Sent); same != d.Same {
			t.Errorf("endpointKey(%q) == endpointKey(%q) is %v, fixture says %v", d.Stored, d.Sent, same, d.Same)
		}
	}
}
GO
cd "$api"
CONSOLE_FIXTURE=$fixture go test -count=1 -run '^TestConsole(PVEAPIURL|EndpointKey)Fixture$' \
  ./internal/resource ./internal/backend/proxmox
