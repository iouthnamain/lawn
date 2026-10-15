#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f .env.local && -f .env.convex.local ]] || { echo 'Configure self-hosting first. See docs/deployment.md.' >&2; exit 1; }
bunx convex env set --force --from-file .env.convex.local
exec bunx convex deploy -y
