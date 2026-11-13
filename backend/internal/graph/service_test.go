package graph

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"connectrpc.com/connect"
	graphv1 "github.com/castlemilk/startup-atlas/backend/gen/atlas/graph/v1"
	"github.com/castlemilk/startup-atlas/backend/gen/atlas/graph/v1/graphv1connect"
)

type handlerTransport struct{ handler http.Handler }

func (h handlerTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	w := httptest.NewRecorder()
	h.handler.ServeHTTP(w, r)
	return w.Result(), nil
}

func TestRealConnectSnapshotSearchAndStartup(t *testing.T) {
	store, err := NewMemory()
	if err != nil {
		t.Fatal(err)
	}
	_, handler := graphv1connect.NewGraphServiceHandler(&Service{Store: store})
	client := graphv1connect.NewGraphServiceClient(&http.Client{Transport: handlerTransport{handler}}, "http://example.test")
	response, err := client.Search(context.Background(), connect.NewRequest(&graphv1.SearchRequest{Query: "canva", Kinds: []string{"startup"}}))
	if err != nil {
		t.Fatal(err)
	}
	if len(response.Msg.Entities) == 0 || response.Msg.Entities[0].Id != "startup:canva" {
		t.Fatalf("unexpected search: %v", response.Msg.Entities)
	}
	startup, err := client.GetStartup(context.Background(), connect.NewRequest(&graphv1.GetStartupRequest{Id: "startup:canva"}))
	if err != nil {
		t.Fatal(err)
	}
	var historicalRound, seedRound, launchFact bool
	for _, round := range startup.Msg.FundingRounds {
		if round.Id == "canva-2021-09-15" && round.Amount == 200000000 && round.Currency == "USD" {
			historicalRound = true
		}
		if round.Id == "canva-2013-seed" && round.AmountText == "$3 million (currency unspecified)" && round.Currency == "" {
			seedRound = true
		}
	}
	for _, fact := range startup.Msg.Startup.ProfileFacts {
		if fact.Key == "product-launch" && fact.Value == "26 August 2013" && fact.Source != "" {
			launchFact = true
		}
	}
	if !historicalRound || !seedRound || !launchFact || len(startup.Msg.Relationships) < 3 {
		t.Fatalf("incomplete graph: %v", startup.Msg)
	}
	_, err = client.GetStartup(context.Background(), connect.NewRequest(&graphv1.GetStartupRequest{Id: "startup:missing"}))
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Fatalf("missing startup: %v", err)
	}
}

type transportFunc func(*http.Request) (*http.Response, error)

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestSupabaseSearchUsesPublishableKeyAndEscapesFilterSyntax(t *testing.T) {
	store, err := NewSupabase("https://project.supabase.co", "sb_publishable_example")
	if err != nil {
		t.Fatal(err)
	}
	store.Client = &http.Client{Transport: transportFunc(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("apikey") != "sb_publishable_example" || r.Header.Get("Authorization") != "" {
			t.Fatal("unexpected authentication headers")
		}
		filter := r.URL.Query().Get("or")
		if strings.Contains(filter, "eq.admin") || !strings.Contains(filter, "canva") {
			t.Fatalf("unexpected filter %q", filter)
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`[{"id":"startup:canva","kind":"startup","name":"Canva"}]`)), Header: make(http.Header)}, nil
	})}
	rows, err := store.Search(context.Background(), "canva),role.eq.admin", []string{"startup"}, 10)
	if err != nil || len(rows) != 1 || rows[0].Name != "Canva" {
		t.Fatalf("search: %v %v", rows, err)
	}
}
