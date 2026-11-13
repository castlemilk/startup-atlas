package graph

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"sort"
	"strings"

	"connectrpc.com/connect"
	graphv1 "github.com/castlemilk/startup-atlas/backend/gen/atlas/graph/v1"
)

//go:embed snapshot.json
var snapshotBytes []byte

type Snapshot struct {
	Entities []*graphv1.Entity       `json:"entities"`
	Edges    []*graphv1.Edge         `json:"edges"`
	Rounds   []*graphv1.FundingRound `json:"funding_rounds"`
	Articles []*graphv1.Article      `json:"articles"`
}

type Repository interface {
	Search(context.Context, string, []string, int) ([]*graphv1.Entity, error)
	Startup(context.Context, string) (*graphv1.GetStartupResponse, error)
}

var ErrNotFound = errors.New("startup not found")

type Memory struct{ Data Snapshot }

func NewMemory() (*Memory, error) {
	var data Snapshot
	if err := json.Unmarshal(snapshotBytes, &data); err != nil {
		return nil, err
	}
	return &Memory{Data: data}, nil
}

func (m *Memory) Search(_ context.Context, q string, kinds []string, limit int) ([]*graphv1.Entity, error) {
	allowed := map[string]bool{}
	for _, k := range kinds {
		allowed[k] = true
	}
	q = strings.ToLower(strings.TrimSpace(q))
	out := make([]*graphv1.Entity, 0)
	for _, e := range m.Data.Entities {
		if len(allowed) > 0 && !allowed[e.Kind] {
			continue
		}
		if q != "" && !strings.Contains(strings.ToLower(e.Name+" "+e.Summary), q) {
			continue
		}
		out = append(out, e)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Kind != out[j].Kind {
			return out[i].Kind > out[j].Kind
		}
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (m *Memory) Startup(_ context.Context, id string) (*graphv1.GetStartupResponse, error) {
	var startup *graphv1.Entity
	byID := map[string]*graphv1.Entity{}
	for _, e := range m.Data.Entities {
		byID[e.Id] = e
		if e.Id == id && e.Kind == "startup" {
			startup = e
		}
	}
	if startup == nil {
		return nil, ErrNotFound
	}
	out := &graphv1.GetStartupResponse{Startup: startup}
	seen := map[string]bool{}
	for _, e := range m.Data.Edges {
		if e.From == id || e.To == id {
			out.Relationships = append(out.Relationships, e)
			other := e.From
			if other == id {
				other = e.To
			}
			if !seen[other] && byID[other] != nil {
				out.RelatedEntities = append(out.RelatedEntities, byID[other])
				seen[other] = true
			}
		}
	}
	for _, r := range m.Data.Rounds {
		if r.StartupId == id {
			out.FundingRounds = append(out.FundingRounds, r)
		}
	}
	for _, a := range m.Data.Articles {
		if a.StartupId == id {
			out.Articles = append(out.Articles, a)
		}
	}
	return out, nil
}

type Service struct{ Store Repository }

func (s *Service) Search(ctx context.Context, req *connect.Request[graphv1.SearchRequest]) (*connect.Response[graphv1.SearchResponse], error) {
	if len(req.Msg.Query) > 200 {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("query too long"))
	}
	limit := int(req.Msg.Limit)
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	rows, err := s.Store.Search(ctx, req.Msg.Query, req.Msg.Kinds, limit)
	if err != nil {
		return nil, connect.NewError(connect.CodeUnavailable, errors.New("graph storage unavailable"))
	}
	return connect.NewResponse(&graphv1.SearchResponse{Entities: rows}), nil
}
func (s *Service) GetStartup(ctx context.Context, req *connect.Request[graphv1.GetStartupRequest]) (*connect.Response[graphv1.GetStartupResponse], error) {
	if !strings.HasPrefix(req.Msg.Id, "startup:") || len(req.Msg.Id) > 200 {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid startup ID"))
	}
	out, err := s.Store.Startup(ctx, req.Msg.Id)
	if errors.Is(err, ErrNotFound) {
		return nil, connect.NewError(connect.CodeNotFound, ErrNotFound)
	}
	if err != nil {
		return nil, connect.NewError(connect.CodeUnavailable, errors.New("graph storage unavailable"))
	}
	return connect.NewResponse(out), nil
}
