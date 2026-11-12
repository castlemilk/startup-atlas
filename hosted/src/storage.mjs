export class OAuthStore {
  constructor(db) { this.db = db; }
  async putState(hash, user, payload, expires) {
    await this.db.prepare('DELETE FROM oauth_states WHERE expires_at < ?').bind(Date.now()).run();
    await this.db.prepare('INSERT INTO oauth_states (state_hash, user_id, payload, expires_at) VALUES (?, ?, ?, ?)').bind(hash, user, payload, expires).run();
  }
  async consumeState(hash, user, now) {
    return this.db.prepare('DELETE FROM oauth_states WHERE state_hash = ? AND user_id = ? AND expires_at > ? RETURNING payload').bind(hash, user, now).first();
  }
  async get(user) { return this.db.prepare('SELECT * FROM oauth_connections WHERE user_id = ?').bind(user).first(); }
  async beginAuth(user) {
    await this.db.prepare('INSERT INTO oauth_connections (user_id, payload, version) VALUES (?, NULL, 1) ON CONFLICT(user_id) DO NOTHING').bind(user).run();
    return this.get(user);
  }
  async save(user, payload, expectedVersion) {
    const result = await this.db.prepare('UPDATE oauth_connections SET payload = ?, version = version + 1, lock_owner = NULL, lock_until = 0 WHERE user_id = ? AND version = ?').bind(payload, user, expectedVersion).run();
    return result.meta.changes === 1;
  }
  async invalidate(user, version, owner) {
    return this.db.prepare('UPDATE oauth_connections SET payload = NULL, version = version + 1, lock_owner = NULL, lock_until = 0 WHERE user_id = ? AND version = ? AND lock_owner = ?').bind(user, version, owner).run();
  }
  async disconnect(user) {
    const results = await this.db.batch([
      this.db.prepare('SELECT payload FROM oauth_connections WHERE user_id = ?').bind(user),
      this.db.prepare('UPDATE oauth_connections SET payload = NULL, version = version + 1, lock_owner = NULL, lock_until = 0 WHERE user_id = ?').bind(user),
      this.db.prepare('DELETE FROM oauth_states WHERE user_id = ?').bind(user),
    ]);
    return results[0].results[0] ?? null;
  }
  async claim(user, version, owner, now) {
    const result = await this.db.prepare('UPDATE oauth_connections SET lock_owner = ?, lock_until = ? WHERE user_id = ? AND version = ? AND lock_owner IS NULL AND payload IS NOT NULL').bind(owner, now + 60000, user, version).run();
    return result.meta.changes === 1;
  }
  async refreshed(user, version, owner, payload) {
    const result = await this.db.prepare('UPDATE oauth_connections SET payload = ?, version = version + 1, lock_owner = NULL, lock_until = 0 WHERE user_id = ? AND version = ? AND lock_owner = ?').bind(payload, user, version, owner).run();
    return result.meta.changes === 1;
  }
}

// Setup-only configuration: no replacement or read/write MCP tool is exposed.
export class GitHubClientConfigStore {
  constructor(db) { this.db = db; }
  async get(user) {
    return this.db.prepare('SELECT payload FROM github_client_configs WHERE user_id = ?').bind(user).first();
  }
  async create(user, payload) {
    const result = await this.db.prepare('INSERT INTO github_client_configs (user_id, payload) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING').bind(user, payload).run();
    return result.meta.changes === 1;
  }
}
