#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
# Review and merge upstream changes yourself before running this script.
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test
bunx convex deploy -y
bun run build
sudo -n systemctl restart lawn-media.service lawn-web.service
