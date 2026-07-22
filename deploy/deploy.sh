#!/usr/bin/env bash
# Update the deployed backend to the latest main.
#
# Usage on the server:  ~/finance-app/deploy/deploy.sh
#
# The frontend needs nothing here — Vercel rebuilds itself on every push.
# This script only updates the API.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/finance-app}"
cd "$APP_DIR"

echo "==> Fetching latest main"
git fetch --quiet origin main
# Show what's about to change, so a deploy is never a surprise.
git --no-pager log --oneline HEAD..origin/main || true
git reset --hard origin/main

echo "==> Installing dependencies"
backend/.venv/bin/pip install --quiet --upgrade -r backend/requirements.txt

echo "==> Restarting the API"
sudo systemctl restart finance-api

# Give it a moment to boot, then prove it actually came back up. A deploy that
# silently leaves the service dead is the worst outcome, so fail loudly here.
sleep 3
if curl --fail --silent --max-time 10 http://127.0.0.1:8000/health > /dev/null; then
	echo "==> Deployed. Health check OK."
else
	echo "!!! Health check FAILED. The API may be down. Recent logs:" >&2
	sudo journalctl -u finance-api -n 30 --no-pager >&2
	exit 1
fi
