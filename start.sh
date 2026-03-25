#!/bin/sh
# Copy static assets into standalone output
cp -r public .next/standalone/public 2>/dev/null || true
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static 2>/dev/null || true

# Find and run server.js (path varies by build environment)
SERVER=$(find .next/standalone -name 'server.js' -not -path '*/node_modules/*' | head -1)
if [ -z "$SERVER" ]; then
  echo "ERROR: server.js not found in .next/standalone"
  exit 1
fi
echo "Starting: $SERVER"
exec node "$SERVER"
