#!/usr/bin/env bash
# Vercel "Ignored Build Step" (vercel.json ignoreCommand).
# Exit 0 = skip this build. Exit 1 = build.
#
# Skips a build only when every file changed since the branch's last
# successful deployment is one the site never ships or type-checks:
# design records, docs, agent config, CI config, SQL migrations, and
# Markdown outside src/ and public/. Anything else, or any doubt
# (no earlier deployment, commit missing from the shallow clone, git
# error), builds. Test files still build: next build type-checks them.

set -u

prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$prev" ]; then
  echo "No earlier deployment on this branch: build."
  exit 1
fi

if ! git cat-file -e "${prev}^{commit}" 2>/dev/null; then
  git fetch --quiet --depth=50 origin "$prev" 2>/dev/null || true
fi
if ! git cat-file -e "${prev}^{commit}" 2>/dev/null; then
  echo "Earlier commit $prev is not in the clone: build."
  exit 1
fi

if ! changed="$(git diff --no-renames --name-only "$prev" HEAD)"; then
  echo "git diff failed: build."
  exit 1
fi

if [ -z "$changed" ]; then
  # The same commit as the last deployment: a deliberate redeploy (a new
  # environment variable, or a build that failed outside the code). Build.
  echo "No file changed since $prev: a redeploy, build."
  exit 1
fi

needs_build=""
while IFS= read -r file; do
  case "$file" in
    .design/*|docs/*|.claude/*|.github/*|supabase/*) ;;
    src/*|public/*) needs_build="$file"; break ;;
    *.md) ;;
    *) needs_build="$file"; break ;;
  esac
done <<EOF
$changed
EOF

if [ -n "$needs_build" ]; then
  echo "Site file changed ($needs_build): build."
  exit 1
fi

echo "Only design, docs and config files changed since $prev: skip."
exit 0
