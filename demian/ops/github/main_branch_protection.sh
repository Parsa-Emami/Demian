#!/usr/bin/env bash
# Apply ONLY with an authenticated repository-admin GitHub account.
# The connector has no repository Administration permission; this owner step
# must run locally after PR08 is merged, never from GITHUB_TOKEN on CI.
# Usage: bash ops/github/main_branch_protection.sh plan|apply|verify
set -Eeuo pipefail
umask 077
mode="${1:-}"
repo="Parsa-Emami/Demian"
branch="main"
[[ "$#" -eq 1 && "$mode" =~ ^(plan|apply|verify)$ ]] || {
    echo "Usage: $0 plan|apply|verify" >&2; exit 2
}
command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }
if [[ "$mode" != plan ]]; then
    command -v gh >/dev/null || { echo "GitHub CLI is required" >&2; exit 2; }
    # No GitHub credential values are printed or accepted on the command line.
    gh auth status >/dev/null 2>&1 || {
        echo "Authenticate with gh auth login using repository admin permissions" >&2; exit 2
    }
fi
required='["release-qa","package","contract","cpanel-runtime","build","backend / replay-and-api (sqlite)","backend / replay-and-api (mysql)"]'
policy="$(jq -n --argjson contexts "$required" '{
  required_status_checks:{strict:true,contexts:$contexts},
  enforce_admins:true,
  required_pull_request_reviews:{
    dismiss_stale_reviews:true,require_code_owner_reviews:false,
    required_approving_review_count:1,require_last_push_approval:true
  },
  restrictions:null,
  required_linear_history:false,
  allow_force_pushes:false,allow_deletions:false,
  required_conversation_resolution:true,
  lock_branch:false,allow_fork_syncing:false
}')"
if [[ "$mode" == plan ]]; then
    echo "No GitHub settings changed. Required PR review: one independent reviewer."
    printf '%s\n' "$policy"
    exit 0
fi
verify() {
    local protection branch_status
    branch_status="$(gh api "/repos/$repo/branches/$branch")" || {
        echo "Cannot verify main protection (admin permission required)" >&2; return 1
    }
    jq -e '.protected == true' <<< "$branch_status" >/dev/null || {
        echo "main is NOT reported as protected" >&2; return 1
    }
    protection="$(gh api "/repos/$repo/branches/$branch/protection")" || {
        echo "Cannot read branch protection with current GitHub admin permissions" >&2; return 1
    }
    jq -e --argjson required "$required" '
      .required_status_checks.strict == true
      and ([.required_status_checks.contexts[]] | sort) == ($required | sort)
      and .enforce_admins.enabled == true
      and .required_pull_request_reviews.dismiss_stale_reviews == true
      and .required_pull_request_reviews.required_approving_review_count >= 1
      and .required_pull_request_reviews.require_last_push_approval == true
      and .required_conversation_resolution.enabled == true
      and .allow_force_pushes.enabled == false
      and .allow_deletions.enabled == false
    ' <<< "$protection" >/dev/null || {
        echo "Branch protection does not meet PR08 policy" >&2; return 1
    }
    echo "Verified: protected main, exact required checks, fresh independent PR review, no force push/deletion."
}
if [[ "$mode" == verify ]]; then verify; exit $?; fi
[[ "${DEMIAN_BRANCH_PROTECTION_APPROVED:-}" == APPLY_MAIN_PROTECTION ]] || {
    echo "Explicit approval missing. Set DEMIAN_BRANCH_PROTECTION_APPROVED=APPLY_MAIN_PROTECTION" >&2
    exit 2
}
temp="$(mktemp)"
trap 'rm -f -- "$temp"' EXIT
printf '%s\n' "$policy" > "$temp"
# Native GitHub REST PUT. Must be executed by the owner/admin; no CI token.
gh api -X PUT -H "Accept: application/vnd.github+json" \
    "/repos/$repo/branches/$branch/protection" --input "$temp" >/dev/null
verify
