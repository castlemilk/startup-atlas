package handler

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGraphHandlerSpeaksConnectJSON(t *testing.T) {
	t.Setenv("SUPABASE_URL", "")
	t.Setenv("SUPABASE_PUBLISHABLE_KEY", "")
	req := httptest.NewRequest("POST", "/api/graph?method=Search", strings.NewReader(`{"query":"Canva","kinds":["startup"]}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Connect-Protocol-Version", "1")
	w := httptest.NewRecorder()
	Handler(w, req)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "startup:canva") {
		t.Fatalf("status %d body %s", w.Code, w.Body.String())
	}
	bad := httptest.NewRecorder()
	Handler(bad, httptest.NewRequest("POST", "/api/graph?method=Unknown", nil))
	if bad.Code != 404 {
		t.Fatalf("invalid route status %d", bad.Code)
	}
}
