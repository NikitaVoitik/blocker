#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

ENV_FILE="$PROJECT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env file not found. Create one with:"
  echo "  EXTENSION_ID=your-extension-id"
  echo "  CLIENT_ID=your-client-id"
  echo "  CLIENT_SECRET=your-client-secret"
  echo "  REFRESH_TOKEN=your-refresh-token"
  exit 1
fi

source "$ENV_FILE"

for var in EXTENSION_ID CLIENT_ID CLIENT_SECRET REFRESH_TOKEN; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: $var is not set in .env"
    exit 1
  fi
done

VERSION=$(grep '"version"' "$PROJECT_DIR/manifest.json" | head -1 | sed 's/.*: *"\(.*\)".*/\1/')
ZIP_FILE="$PROJECT_DIR/dist/blocker-${VERSION}.zip"

mkdir -p "$PROJECT_DIR/dist"

echo "Zipping extension v${VERSION}..."
cd "$PROJECT_DIR"
zip -r "$ZIP_FILE" . \
  -x ".git/*" \
  -x ".gitignore" \
  -x ".env" \
  -x ".claude/*" \
  -x "node_modules/*" \
  -x "dist/*" \
  -x "tests/*" \
  -x "scripts/*" \
  -x "docs/*" \
  -x "site/*" \
  -x "store-screenshots/*" \
  -x "playwright-report/*" \
  -x "test-results/*" \
  -x "playwright.config.*" \
  -x "package.json" \
  -x "package-lock.json" \
  -x "pnpm-lock.yaml" \
  -x "tsconfig.json" \
  -x "*.md" \
  -x "_metadata/*"

echo "Getting access token..."
ACCESS_TOKEN=$(curl -s -X POST https://oauth2.googleapis.com/token \
  -d "client_id=${CLIENT_ID}" \
  -d "client_secret=${CLIENT_SECRET}" \
  -d "refresh_token=${REFRESH_TOKEN}" \
  -d "grant_type=refresh_token" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "Uploading to Chrome Web Store..."
UPLOAD_RESPONSE=$(curl -s -X PUT \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "x-goog-api-version: 2" \
  -T "$ZIP_FILE" \
  "https://www.googleapis.com/upload/chromewebstore/v1.1/items/${EXTENSION_ID}")

UPLOAD_STATUS=$(echo "$UPLOAD_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('uploadState','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")

if [ "$UPLOAD_STATUS" != "SUCCESS" ]; then
  echo "Upload failed:"
  echo "$UPLOAD_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$UPLOAD_RESPONSE"
  exit 1
fi

echo "Upload successful. Publishing..."
PUBLISH_RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "x-goog-api-version: 2" \
  "https://www.googleapis.com/chromewebstore/v1.1/items/${EXTENSION_ID}/publish")

echo "$PUBLISH_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$PUBLISH_RESPONSE"
echo ""
echo "Done! v${VERSION} published."
