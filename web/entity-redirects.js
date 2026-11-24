// Entity IDs retired by a merge keep working as shared links: the identity
// registry (data/identity.json) records each loser's `merged_into` winner,
// and the build publishes the resolved subset as data/entity-redirects.json.
// Resolution follows merge chains and is cycle-safe, mirroring
// scripts/entity_resolution.py's resolve_id.

export function resolveEntityRedirect(id, redirects) {
  const lookup = redirects instanceof Map
    ? (key) => redirects.get(key)
    : (key) => redirects?.[key];
  let current = id;
  const seen = new Set();
  while (current && lookup(current) && !seen.has(current)) {
    seen.add(current);
    current = lookup(current);
  }
  return current && current !== id ? current : null;
}

// Build the publishable redirect map from the identity registry: only
// merged IDs whose final canonical target is a published entity survive,
// so a redirect can never point at another dead end.
export function buildEntityRedirects(identity, validIds) {
  const raw = {};
  for (const [id, record] of Object.entries(identity?.entities ?? {})) {
    if (record?.merged_into) raw[id] = record.merged_into;
  }
  const redirects = {};
  for (const id of Object.keys(raw).sort()) {
    const target = resolveEntityRedirect(id, raw);
    if (target && validIds.has(target)) redirects[id] = target;
  }
  return redirects;
}
