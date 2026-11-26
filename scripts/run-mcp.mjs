#!/usr/bin/env node
// Launcher for the local Startup Atlas MCP servers (see docs/INSTALL-MCP.md).
//
// Why this exists: the MCP server's dependencies live in backend/mcp/ with
// their own lockfile, but the repository's documented setup
// (`npm ci --ignore-scripts` at the root) skips the root postinstall hook
// that would install them. A fresh clone therefore died with a bare
// ERR_MODULE_NOT_FOUND for '@modelcontextprotocol/sdk', with no hint of
// the fix. This launcher installs the backend/mcp dependencies on first
// run, then starts the server with stdio inherited and arguments
// forwarded untouched:
//
//   npm run mcp -- --write          stdio server (default)
//   npm run mcp:http -- --write     HTTP server (needs the ATLAS_GOOGLE_*
//                                   environment, see backend/mcp/.env.example)
//
// Install chatter is sent to stderr only: in stdio mode stdout is the MCP
// protocol stream and must stay clean.
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mcpDir = path.join(root, 'backend', 'mcp');
const sdkDir = path.join(mcpDir, 'node_modules', '@modelcontextprotocol', 'sdk');

if (!existsSync(sdkDir)) {
  console.error('[startup-atlas] First run: installing MCP server dependencies (npm ci --prefix backend/mcp --ignore-scripts)…');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const install = spawnSync(npm, ['ci', '--prefix', 'backend/mcp', '--ignore-scripts'], {
    cwd: root,
    stdio: ['ignore', process.stderr, process.stderr],
  });
  if (install.error || install.status !== 0) {
    console.error('[startup-atlas] Dependency install failed. Run it manually to see the error:');
    console.error('  npm ci --prefix backend/mcp --ignore-scripts');
    process.exit(install.status ?? 1);
  }
}

const argv = process.argv.slice(2);
const http = argv[0] === '--http';
const serverArgs = http ? argv.slice(1) : argv;
const entry = path.join(mcpDir, http ? 'http-server.mjs' : 'server.mjs');

const child = spawn(process.execPath, [entry, ...serverArgs], { cwd: root, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', (error) => {
  console.error(`[startup-atlas] Failed to start the MCP server: ${error.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
