#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_env.sh"

echo "[+] Building site into _site"
compose run --rm jekyll jekyll build --trace
echo "[+] Build complete"
