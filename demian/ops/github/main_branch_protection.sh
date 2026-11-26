#!/usr/bin/env bash
# Demian main protection. Admin-only apply; all other modes are read-only.
# GitHub App connectors without Administration permission cannot apply this policy.
# Usage: bash ops/github/main_branch_protection.sh plan|preflight|apply|verify
set -Eeuo pipefail
umask 077

mode="$(printf '%s' "$*" | xargs)"
repo="Parsa-Emami/Demian"
owner="Parsa-Emami"
branch="main"
required='["release-qa","package","contract","cpanel-runtime","build","load-100","backend / replay-and-api (sqlite)","backend / replay-and-api (mysql)"]'

[[ "$#" -eq 1 && "$mode" =~ ^(plan|preflight|apply|verify)$ ]] || {
  echo "Usage: $0 plan|preflight|apply|verify" >&2
  exit 2
}
command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }

# One independent approving reviewer, fresh approval after latest push, no bypass
# for admins, strict green checks on the latest base, no branch deletion/force push.
policy="$(jq -n --argjson contexts "$required" '{
  required_status_checks: {strict:true, contexts:$contexts},
  enforce_admins:true,
  required_pull_request_reviews: {
    dismiss_stale_reviews:true,
    require_code_owner_reviews:false,
    required_approving_review_count:1,
    require_last_push_approval:true
  },
  restrictions:null,
  required_linear_history:false,
  allow_force_pushes:false,
  allow_deletions:false,
  required_conversation_resolution:true,
  lock_branch:false,
  allow_fork_syncing:false
}')"

if [[ "$mode" == plan ]]; then
  printf '%s\n' "$policy"
  exit 0
fi

command -v gh >/dev/null || { echo "GitHub CLI (gh) is required" >&2; exit 2; }
gh auth status >/dev/null 2>&1 || {
  echo "Sign in with gh auth login as a repository administrator" >&2
  exit 2
}

api_get() {
  gh api -H "Accept: application/vnd.github+json" "$1"
}
read_main() {
  api_get "/repos/$repo/branches/$branch" || {
    echo "Cannot read main branch" >&2
    return 1
  }
}
verify() {
  local branch_info actual
  branch_info="$(read_main)" || return 1
  jq -e '.protected == true' <<< "$branch_info" >/dev/null || {
    echo "FAILED: main is not protected" >&2
    return 1
  }
  actual="$(api_get "/repos/$repo/branches/$branch/protection")" || {
    echo "FAILED: cannot read protection; administrator permission required" >&2
    return 1
  }
  jq -e --argjson required "$required" '
    .required_status_checks.strict == true
    and ([.required_status_checks.contexts[]] | sort) == ($required | sort)
    and .enforce_admins.enabled == true
    and .required_pull_request_reviews.dismiss_stale_reviews == true
    and .required_pull_request_reviews.require_last_push_approval == true
    and .required_pull_request_reviews.required_approving_review_count >= 1
    and .required_conversation_resolution.enabled == true
    and .allow_force_pushes.enabled == false
    and .allow_deletions.enabled == false
  ' <<< "$actual" >/dev/null || {
    echo "FAILED: actual GitHub protection differs from approved policy" >&2
    return 1
  }
  echo "VERIFIED: main protected; strict eight required checks; independent fresh review; no admin bypass, force push or deletion"
}

if [[ "$mode" == verify ]]; then
  verify
  exit $?
fi

# Never silently replace another policy or remove admins' custom controls.
before="$(read_main)"
before_sha="$(jq -er '.commit.sha | select(test("^[a-f0-9]{40}$"))' <<< "$before")" || {
  echo "Cannot establish exact main SHA" >&2
  exit 1
}
if jq -e '.protected == true' <<< "$before" >/dev/null; then
  echo "main is already protected; verifying existing rules instead of overwriting." >&2
  verify
  exit $?
fi

# A solo-owned repository cannot satisfy one independent approval. Refuse to
# create a permanently unmergeable main until a distinct write-capable user exists.
collaborators="$(api_get "/repos/$repo/collaborators?per_page=100")" || {
  echo "Cannot verify independent reviewer permissions" >&2
  exit 1
}
jq -e --arg owner "$owner" '
  type=="array" and any(.[];
    .login != $owner and
    (.permissions.push == true or .permissions.maintain == true or .permissions.admin == true)
  )
' <<< "$collaborators" >/dev/null || {
  echo "BLOCKED: add an independent write-capable collaborator/reviewer before protecting main" >&2
  exit 1
}

# These names must be emitted on *every* PR and main push. Both path-filtered
# workflows were converted to unconditional triggers in this change.
checks="$(api_get "/repos/$repo/commits/$before_sha/check-runs?per_page=100")" || {
  echo "Cannot read exact-main-SHA check runs" >&2
  exit 1
}
jq -e --argjson required "$required" '
  [.check_runs[] |
    select(.status == "completed" and .conclusion == "success" and .app.slug == "github-actions") |
    .name] as $good
  | all($required[]; . as $name | ($good | index($name)) != null)
' <<< "$checks" >/dev/null || {
  echo "BLOCKED: one or more required GitHub Actions checks have not passed on current main SHA" >&2
  echo "Do not enable required checks until all jobs run unconditionally on main and PRs." >&2
  exit 1
}

echo "PREFLIGHT PASSED: independent reviewer available and eight successful checks on main SHA $before_sha"
if [[ "$mode" == preflight ]]; then
  exit 0
fi

[[ "$mode" == apply ]] || exit 2
[[ "$(printenv DEMIAN_BRANCH_PROTECTION_APPROVED || true)" == APPLY_MAIN_PROTECTION ]] || {
  echo "Approval missing. Set DEMIAN_BRANCH_PROTECTION_APPROVED=APPLY_MAIN_PROTECTION" >&2
  exit 2
}

# Avoid applying a policy based on CI evidence from an obsolete main head.
now="$(read_main)"
[[ "$(jq -r '.commit.sha' <<< "$now")" == "$before_sha" ]] || {
  echo "main moved during preflight; retry after exact-SHA checks pass" >&2
  exit 1
}
[[ "$(jq -r '.protected' <<< "$now")" == false ]] || {
  echo "main was protected by another actor; refusing to overwrite it" >&2
  exit 1
}
temp="$(mktemp)"
trap 'rm -f -- "$temp"' EXIT
printf '%s\n' "$policy" > "$temp"
gh api -X PUT -H "Accept: application/vnd.github+json" \
  "/repos/$repo/branches/$branch/protection" --input "$temp" >/dev/null
verify
