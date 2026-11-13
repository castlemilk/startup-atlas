package graph

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode"

	graphv1 "github.com/castlemilk/startup-atlas/backend/gen/atlas/graph/v1"
)

// Supabase uses the publishable key and RLS; it never receives a service-role key.
type Supabase struct {
	Base, Key string
	Client    *http.Client
}

func NewSupabase(base, key string) (*Supabase, error) {
	u, err := url.Parse(base)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || key == "" {
		return nil, errors.New("invalid Supabase public configuration")
	}
	return &Supabase{Base: strings.TrimRight(base, "/"), Key: key, Client: &http.Client{Timeout: 8 * time.Second}}, nil
}
func (s *Supabase) fetch(ctx context.Context, table string, values url.Values, target any) error {
	urlString := s.Base + "/rest/v1/" + table + "?" + values.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, urlString, nil)
	if err != nil {
		return err
	}
	req.Header.Set("apikey", s.Key)
	res, err := s.Client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return fmt.Errorf("storage returned HTTP %d", res.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(res.Body, 2_000_000)).Decode(target)
}

const entitySelect = "id,kind,name,summary,website,source:source_url,logo:logo_url,logo_source:logo_source_url,founded_year"

func (s *Supabase) Search(ctx context.Context, q string, kinds []string, limit int) ([]*graphv1.Entity, error) {
	v := url.Values{"select": {entitySelect}, "publication_status": {"eq.published"}, "order": {"kind.desc,name.asc"}, "limit": {fmt.Sprint(limit)}}
	// Restrict PostgREST filter syntax so a search term cannot add predicates.
	clean := strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.IsSpace(r) {
			return r
		}
		return ' '
	}, q)
	clean = strings.TrimSpace(clean)
	if clean != "" {
		v.Set("or", "(name.ilike.*"+clean+"*,summary.ilike.*"+clean+"*)")
	}
	if len(kinds) > 0 {
		valid := map[string]bool{"startup": true, "partner": true, "provider": true, "person": true}
		for _, k := range kinds {
			if !valid[k] {
				return []*graphv1.Entity{}, nil
			}
		}
		v.Set("kind", "in.("+strings.Join(kinds, ",")+")")
	}
	var rows []*graphv1.Entity
	err := s.fetch(ctx, "atlas_entities", v, &rows)
	return rows, err
}
func (s *Supabase) Startup(ctx context.Context, id string) (*graphv1.GetStartupResponse, error) {
	// IDs have only the permitted graph slug characters before interpolation in filters.
	for _, r := range id {
		if !(r == ':' || r == '-' || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')) {
			return nil, ErrNotFound
		}
	}
	var entities []*graphv1.Entity
	if err := s.fetch(ctx, "atlas_entities", url.Values{"select": {entitySelect}, "id": {"eq." + id}, "kind": {"eq.startup"}, "limit": {"1"}}, &entities); err != nil {
		return nil, err
	}
	if len(entities) == 0 {
		return nil, ErrNotFound
	}
	out := &graphv1.GetStartupResponse{Startup: entities[0]}
	if err := s.fetch(ctx, "atlas_edges", url.Values{"select": {"from:from_id,to:to_id,kind,description,source:source_url"}, "or": {"(from_id.eq." + id + ",to_id.eq." + id + ")"}, "limit": {"500"}}, &out.Relationships); err != nil {
		return nil, err
	}
	if err := s.fetch(ctx, "atlas_funding_rounds", url.Values{"select": {"id,startup_id,stage,announced_on,amount,currency,valuation,valuation_currency,note,source:source_url"}, "startup_id": {"eq." + id}, "order": {"announced_on.desc.nullslast"}, "limit": {"100"}}, &out.FundingRounds); err != nil {
		return nil, err
	}
	if err := s.fetch(ctx, "atlas_articles", url.Values{"select": {"startup_id,title,url,published_on,kind"}, "startup_id": {"eq." + id}, "order": {"published_on.desc.nullslast"}, "limit": {"100"}}, &out.Articles); err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	var relatedIDs []string
	for _, e := range out.Relationships {
		other := e.From
		if other == id {
			other = e.To
		}
		if seen[other] {
			continue
		}
		seen[other] = true
		for _, r := range other {
			if !(r == ':' || r == '-' || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')) {
				return nil, errors.New("invalid related entity ID")
			}
		}
		relatedIDs = append(relatedIDs, other)
	}
	if len(relatedIDs) > 0 {
		if err := s.fetch(ctx, "atlas_entities", url.Values{"select": {entitySelect}, "id": {"in.(" + strings.Join(relatedIDs, ",") + ")"}, "limit": {"500"}}, &out.RelatedEntities); err != nil {
			return nil, err
		}
	}
	return out, nil
}
