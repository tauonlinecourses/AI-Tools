#!/bin/sh
# Vercel "Ignored Build Step" for every app (vercel.json ignoreCommand).
# Runs from the app's Root Directory (apps/<app>).
# Exit 0 = skip the build, 1 = build. Any other code fails the deployment,
# so every path below ends in 0 or 1.
#
# Only main deploys. A main deploy is skipped when nothing the app depends on
# changed since the last deployed commit. Pass extra paths the app depends on
# as arguments (e.g. ../../packages/mbz-parser).
#
# Kept in a script because Vercel caps ignoreCommand at 256 characters.

[ "$VERCEL_GIT_COMMIT_REF" != "main" ] && exit 0

base="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"

# Vercel clones shallowly, so an older last-deployed commit may be missing.
# Without it we can't compare: build to be safe.
if ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  echo "Base commit $base not in clone; building."
  exit 1
fi

if git diff --quiet "$base" HEAD -- \
  . \
  ../../pnpm-lock.yaml \
  ../../packages/ui \
  ../../packages/config \
  ../../packages/ai-client \
  ../../packages/auth \
  ../../scripts/vercel-ignore.sh \
  "$@"; then
  echo "No changes since $base; skipping build."
  exit 0
fi

echo "Changes since $base; building."
exit 1
