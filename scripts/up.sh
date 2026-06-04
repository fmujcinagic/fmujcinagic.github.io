#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_env.sh"

echo "[+] Starting Jekyll preview server"
compose up --build -d
echo "[+] Preview running at http://127.0.0.1:4000"
echo "[+] Use ./scripts/logs.sh to follow logs"
