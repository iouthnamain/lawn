#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Use the configured self-hosted backend; production remains on port 5296.
bunx convex deploy -y
exec bunx vite dev --host 127.0.0.1 --port "${LAWN_DEV_PORT:-5298}"
