#!/usr/bin/env bash
# Deploy the hosted Startup Atlas MCP app via DeepHost.
# Working arguments (verified 24 Nov 2026): the SHORT app name is
# mandatory — the full name resolves to a duplicate app record and fails.
# framework MUST be passed explicitly as "node": omitting it once reset
# the app to static and took the hosted MCP/admin offline (~13 min).
set -euo pipefail
cat <<'NOTE'
deploy: deephost_deploy_app with:
  name=startup-atlas-mcp repository=castlemilk/startup-atlas revision=main
  framework=node environment=production
  (NO domains, NO env_secrets — existing links carry over)
then: deephost_get_build (app + build_id) -> deephost_promote_release
  (app + release_id rel-<build_id>) -> verify /health returns 200.
NOTE
