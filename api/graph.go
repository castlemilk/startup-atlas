package handler

import (
	"net/http"
	"os"
	"sync"

	"github.com/castlemilk/startup-atlas/gen/atlas/graph/v1/graphv1connect"
	"github.com/castlemilk/startup-atlas/internal/graph"
)

var once sync.Once
var service http.Handler
var initErr error

func initialize() {
	base, key := os.Getenv("SUPABASE_URL"), os.Getenv("SUPABASE_PUBLISHABLE_KEY")
	var repo graph.Repository
	if base == "" && key == "" {
		repo, initErr = graph.NewMemory()
	} else {
		repo, initErr = graph.NewSupabase(base, key)
	}
	if initErr != nil {
		return
	}
	_, service = graphv1connect.NewGraphServiceHandler(&graph.Service{Store: repo})
}

// Handler is a single Vercel Go function exposing two Connect unary methods.
// POST /api/graph?method=Search or ?method=GetStartup uses Connect JSON.
func Handler(w http.ResponseWriter, r *http.Request) {
	once.Do(initialize)
	if initErr != nil {
		http.Error(w, "Graph configuration unavailable", http.StatusServiceUnavailable)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	method := r.URL.Query().Get("method")
	if method != "Search" && method != "GetStartup" {
		http.NotFound(w, r)
		return
	}
	request := r.Clone(r.Context())
	path := *r.URL
	path.Path = "/atlas.graph.v1.GraphService/" + method
	request.URL = &path
	service.ServeHTTP(w, request)
}
