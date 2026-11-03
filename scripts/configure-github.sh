set -euo pipefail
repository="${1:?Uso: bash scripts/configure-github.sh owner/repo revisor}"
reviewer="${2:?Informe o login de um integrante revisor}"
gh auth status
test "$(gh repo view "$repository" --json visibility --jq '.visibility')" = PUBLIC
reviewer_id="$(gh api "users/$reviewer" --jq .id)"
permission="$(gh api "repos/$repository/collaborators/$reviewer/permission" --jq .permission)"
case "$permission" in read|triage|write|maintain|admin) ;; *) exit 1 ;; esac
gh api --method PUT "repos/$repository/environments/homologacao" > /dev/null
jq -n --argjson id "$reviewer_id" '{wait_timer:0,prevent_self_review:false,reviewers:[{type:"User",id:$id}],deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}}' | gh api --method PUT "repos/$repository/environments/producao" --input - > /dev/null
existing="$(gh api "repos/$repository/environments/producao/deployment-branch-policies" --jq '.branch_policies[]? | select(.name == "main") | .id')"
if [ -z "$existing" ]; then
  jq -n '{name:"main",type:"branch"}' | gh api --method POST "repos/$repository/environments/producao/deployment-branch-policies" --input - > /dev/null
fi
printf 'Environments configurados. Revisor obrigatório: %s\n' "$reviewer"
