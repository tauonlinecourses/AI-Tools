#!/bin/sh
# Vercel "Ignored Build Step" for every app (vercel.json ignoreCommand).
# Runs from the app's Root Directory (apps/<app>).
# Exit 0 = skip the build, non-zero = build.
#
# Only main deploys. A main deploy is skipped when nothing the app depends on
# changed since the last deployed commit. Pass extra paths the app depends on
# as arguments (e.g. ../../packages/mbz-parser).
#
# Kept in a script because Vercel caps ignoreCommand at 256 characters.

[ "$VERCEL_GIT_COMMIT_REF" != "main" ] && exit 0

git diff --quiet "${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}" HEAD -- \
  . \
  ../../pnpm-lock.yaml \
  ../../packages/ui \
  ../../packages/config \
  ../../packages/ai-client \
  ../../packages/auth \
  ../../scripts/vercel-ignore.sh \
  "$@"
