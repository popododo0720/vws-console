#!/usr/bin/env bash
# Repo guard (popododo0720/vws-deploy#448). Runs the checks of the shared scripts/guard-agents.sh that
# read this repo's own files. The guard job of .github/workflows/ci.yml runs it on every pull request;
# scripts/guard_test.sh shows that it fails on a broken input.
# Usage: scripts/guard.sh [all|correct|english|references]
set -euo pipefail
cd "$(dirname "$0")/.."

die() {
  echo "guard: $*" >&2
  exit 1
}

# R21: the /correct loop. AGENTS.md has a non-empty '## /correct loop' section, the incident form applies
# the incident label with every required field, and .github/labels.yml defines the label.
cmd_correct() {
  scripts/guard-agents.sh correct . ||
    die "R21: the /correct loop, incident form or incident label is missing (AGENTS.md '## /correct loop', .github/ISSUE_TEMPLATE/incident.yml, .github/labels.yml)"
}

# Every tracked file is English, except the globs in .github/english-allowlist (AGENTS.md, issue #91).
cmd_english() {
  scripts/guard-agents.sh english .github/english-allowlist
}

# Reference images are local-only (AGENTS.md, issue #91): docs/design-references/ tracks nothing but .gitkeep.
cmd_references() {
  local listed tracked
  listed=$(git ls-files -- docs/design-references) || die "references: git ls-files failed"
  tracked=$(grep -v -x -F docs/design-references/.gitkeep <<<"$listed" || true)
  [[ -z $tracked ]] || die "references: docs/design-references/ is local-only (AGENTS.md); untrack: ${tracked//$'\n'/ }"
}

case ${1:-all} in
  all)
    cmd_correct
    cmd_english
    cmd_references
    ;;
  correct) cmd_correct ;;
  english) cmd_english ;;
  references) cmd_references ;;
  -h | --help)
    sed -n "2,5p" "$0"
    exit 0
    ;;
  *) die "usage: scripts/guard.sh [all|correct|english|references]" ;;
esac
echo "guard ok"
