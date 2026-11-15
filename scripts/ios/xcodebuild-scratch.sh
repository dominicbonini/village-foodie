#!/bin/bash
# scripts/ios/xcodebuild-scratch.sh — disk-cleanup-1 (15 November 2026): xcodebuild for SCRIPTS and agents.
#   scripts/ios/xcodebuild-scratch.sh -workspace ios/App/App.xcworkspace -scheme App -sdk iphonesimulator build
# DerivedData goes to a throwaway folder (HG_SCRATCH if set — an agent's session scratch folder — else a new temp
# folder) and is deleted when the build ends, however it ends. ~/Library/Developer/Xcode/DerivedData is never used,
# so scripted builds cannot pile up there. Runs under the disk guard (scripts/guarded.sh: 40 GB to start, stops <20 GB).
# Don't pass -derivedDataPath yourself. To keep a built .app (e.g. to install on a simulator), copy it out with
# HG_KEEP_APP=<folder>: every *.app under Build/Products is copied there before the clean-up.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="${HG_SCRATCH:-${TMPDIR:-/tmp}}"
DD="$(mktemp -d "$BASE/xcode-dd.XXXXXX")" || exit 2
cleanup(){
  if [ -n "${HG_KEEP_APP:-}" ]; then mkdir -p "$HG_KEEP_APP"; find "$DD/Build/Products" -maxdepth 2 -name '*.app' -exec cp -R {} "$HG_KEEP_APP/" \; 2>/dev/null; fi
  rm -rf "$DD"
}
trap cleanup EXIT
"$HERE/../guarded.sh" xcodebuild -derivedDataPath "$DD" "$@"
