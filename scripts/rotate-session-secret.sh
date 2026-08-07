#!/usr/bin/env bash
# Rotate SESSION_SECRET: generates a fresh 32-byte secret, backs it up to a
# gitignored local file (so a broken deploy never locks you out of recovery),
# then uploads it as the Worker secret.
#
# IMPORTANT: rotating invalidates every active session — all users (including
# you) must log in again once.
#
# Usage: bash scripts/rotate-session-secret.sh
set -euo pipefail

BACKUP_FILE=".session-secrets.txt"

SECRET=$(openssl rand -hex 32)
mkdir -p "$(dirname "$BACKUP_FILE")"
echo "$(date -u +%FT%TZ) $SECRET" >>"$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"

echo "🔑 New SESSION_SECRET generated (32 bytes)"
printf '%s' "$SECRET" | wrangler secret put SESSION_SECRET

echo ""
echo "✅ Rotated & backed up to $BACKUP_FILE"
echo "⚠️  All sessions are now invalid — log in again."
echo "💾 Keep $BACKUP_FILE safe (it is gitignored but IS the recovery key)."
