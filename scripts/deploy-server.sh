#!/usr/bin/env bash
# Deploy the Fly server from a clean checkout of HEAD only.
#
# Why: `fly deploy` uploads whatever is in the folder, including other sessions'
# uncommitted work. This script builds from a temporary git worktree at HEAD so
# only committed (and pushed) code reaches production.
#
# Usage: scripts/deploy-server.sh [extra flyctl deploy flags]
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
APP="basketballgm-app-server"
SHA="$(git -C "$ROOT" rev-parse --short HEAD)"

# Only deploy commits that are already on the remote, so every session can see what is live.
git -C "$ROOT" fetch -q origin
if [ -z "$(git -C "$ROOT" branch -r --contains HEAD)" ]; then
    echo "error: HEAD $SHA is not pushed to origin. Push first, then deploy." >&2
    exit 1
fi

DIR="$(mktemp -d "${TMPDIR:-/tmp}/nbagm-deploy-XXXXXX")"
cleanup() { git -C "$ROOT" worktree remove --force "$DIR" >/dev/null 2>&1 || rm -rf "$DIR"; }
trap cleanup EXIT

git -C "$ROOT" worktree add -q --detach "$DIR" HEAD

# Frozen engine snapshots (server/src/engineSnapshots/*) must still match the commits they were taken from —
# rooms pinned to a snapshot (engine profile) rely on that. Refuse to deploy if any file drifted.
for manifest in "$DIR"/server/src/engineSnapshots/*/MANIFEST.json; do
    [ -f "$manifest" ] || continue
    if [ ! -f "$DIR/scripts/engineSnapshot.mjs" ]; then
        echo "error: engine snapshots exist but scripts/engineSnapshot.mjs is not committed (scripts/ is gitignored: git add -f)." >&2
        exit 1
    fi
    (cd "$DIR" && node scripts/engineSnapshot.mjs verify "$(basename "$(dirname "$manifest")")")
done

echo "Deploying $APP from clean HEAD $SHA ($(git -C "$ROOT" log -1 --format=%s HEAD))"
(cd "$DIR/server" && flyctl deploy -a "$APP" --remote-only --image-label "git-$SHA" "$@")
echo "Deployed $APP at git $SHA"
