// Queries against the immutable, published SQLite snapshot. Values are bound;
// search input never becomes SQL or raw FTS syntax.
function rows(db, sql, params = []) {
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    const result = [];
    while (statement.step()) result.push(statement.getAsObject());
    return result;
  } finally { statement.free(); }
}

export function searchGraph(db, query, limit = 100) {
  const value = query.trim().normalize('NFKC');
  const tokens = value.match(/[\p{L}\p{N}]+/gu) || [];
  if (value && !tokens.length) return [];
  const searchable = "e.kind IN ('startup','partner','provider','person','programme')";
  let sql, params;
  if (tokens.length) {
    const terms = tokens.slice(0, 12).map(token => `"${token}*"`).join(' AND ');
    const prefix = value.replace(/[\\%_]/g, '\\$&') + '%';
    sql = `SELECT e.data FROM entity_search s JOIN entities e ON e.id=s.id
      WHERE entity_search MATCH ? AND ${searchable}
      ORDER BY CASE WHEN lower(e.name)=lower(?) THEN 0 WHEN e.name LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END,
      (e.kind='startup') DESC, e.name COLLATE NOCASE LIMIT ?`;
    params = [terms, value, prefix, limit];
  } else {
    sql = `SELECT e.data FROM entities e WHERE ${searchable}
      ORDER BY (e.kind='startup') DESC, e.name COLLATE NOCASE LIMIT ?`;
    params = [limit];
  }
  return rows(db, sql, params).map(row => JSON.parse(row.data));
}

export function getStartup(db, id) {
  const entity = rows(db, "SELECT data FROM entities WHERE id=? AND kind='startup'", [id]);
  if (!entity.length) throw new Error('Startup not found');
  const edges = rows(db, 'SELECT data FROM edges WHERE source_id=? OR target_id=?', [id, id]).map(row => JSON.parse(row.data));
  const related = rows(db, `SELECT DISTINCT e.data FROM entities e JOIN edges x
    ON (e.id=x.source_id AND x.target_id=?) OR (e.id=x.target_id AND x.source_id=?)`, [id, id]).map(row => JSON.parse(row.data));
  const rounds = rows(db, 'SELECT data FROM funding_rounds WHERE startup_id=? ORDER BY announced_on DESC', [id]).map(row => JSON.parse(row.data));
  const articles = rows(db, 'SELECT data FROM articles WHERE startup_id=? ORDER BY published_on DESC', [id]).map(row => JSON.parse(row.data));
  return { startup: JSON.parse(entity[0].data), edges, related, rounds, articles };
}

export function getGraph(db) {
  const read = table => rows(db, `SELECT data FROM ${table}`).map(row => JSON.parse(row.data));
  return {entities:read('entities'), edges:read('edges'), funding_rounds:read('funding_rounds'), articles:read('articles')};
}

export function getOpportunity(db, id) {
  const result=rows(db,'SELECT data FROM opportunities WHERE id=?',[id]);
  return result.length ? JSON.parse(result[0].data) : null;
}
