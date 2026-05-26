#!/usr/bin/env bash
# Run this on your LAPTOP, not the remote box.
# Mirrors the extension from the remote into the local folder Arc loads unpacked.
# After it finishes, click the reload button on arc://extensions.
#
# First-time setup (on your laptop):
#   1. Save this file somewhere, e.g. ~/bin/blocker-sync.sh, and chmod +x it.
#      (Or pull the repo once and run scripts/sync.sh from it.)
#   2. Set REMOTE_HOST below (or export it) to whatever you ssh to.
#   3. Run it once. Then in Arc: arc://extensions -> Developer mode ->
#      Load unpacked -> pick ~/WebstormProjects/blocker.
#
# Iteration: run this, then click the reload icon on the Blocker entry.

set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-nikita@34.89.130.39}"
REMOTE_PATH="${REMOTE_PATH:-blocker/}"
LOCAL_PATH="${LOCAL_PATH:-$HOME/WebstormProjects/blocker/}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/gcp-personal}"

mkdir -p "$LOCAL_PATH"

rsync -avz --delete -e "ssh -i ${SSH_KEY}" \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='tests/' \
  --exclude='playwright-report/' \
  --exclude='test-results/' \
  --exclude='_metadata/' \
  --exclude='docs/' \
  --exclude='scripts/' \
  --exclude='blocker.zip' \
  --exclude='.DS_Store' \
  --exclude='package*.json' \
  --exclude='playwright.config.ts' \
  --exclude='tsconfig.json' \
  "${REMOTE_HOST}:${REMOTE_PATH}" \
  "${LOCAL_PATH}"

echo
echo "Synced -> ${LOCAL_PATH}"
echo "Now click the reload icon for Blocker on arc://extensions."
