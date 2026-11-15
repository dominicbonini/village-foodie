#!/bin/bash
# scripts/guarded.sh — disk-cleanup-1 (15 November 2026): run ANY build command under the disk-space guard.
#   scripts/guarded.sh npx next build
#   (cd android && ../scripts/guarded.sh ./gradlew bundleRelease)
# Refuses to start below 40 GB free; stops the command (SIGTERM, then its exit code) if free space falls below 20 GB
# while it runs. The thresholds live in scripts/_disk-guard.cjs only. Exit 3 = refused, 4 = stopped for space.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ $# -gt 0 ] || { echo "usage: scripts/guarded.sh <command…>" >&2; exit 2; }
node "$HERE/_disk-guard.cjs" check "$1" || exit 3
"$@" &
CHILD=$!
trap 'kill -TERM $CHILD 2>/dev/null' TERM INT
node "$HERE/_disk-guard.cjs" watch $CHILD "$1" &
WATCH=$!
wait $CHILD; CODE=$?
wait $WATCH 2>/dev/null; WCODE=$?
[ "$WCODE" = 4 ] && exit 4
exit $CODE
