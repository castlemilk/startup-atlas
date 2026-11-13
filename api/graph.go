// Package handler keeps Vercel's public /api/graph function entry point.
package handler

import (
	"net/http"

	graphapi "github.com/castlemilk/startup-atlas/backend/api"
)

// Handler delegates to the graph service in backend.
func Handler(w http.ResponseWriter, r *http.Request) {
	graphapi.Handler(w, r)
}
