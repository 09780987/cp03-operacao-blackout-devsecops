set -euo pipefail
name="${1:-cp03-operacao-blackout-devsecops}"
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  git init -b main
  git add .
  git commit -m 'Adiciona o Operação Blackout e a esteira DevSecOps'
fi
gh auth status
owner="$(gh api user --jq .login)"
repository="$owner/$name"
if [ -z "$(git remote get-url origin 2>/dev/null || true)" ]; then
  gh repo create "$repository" --public --source . --remote origin --description 'CP03 DevSecOps - Operação Blackout - RM565098 e RM565963'
fi
remote="$(git remote get-url origin)"
case "$remote" in "https://github.com/$repository.git"|"https://github.com/$repository"|"git@github.com:$repository.git") ;; *) printf 'O remote origin não corresponde ao repositório solicitado.\n' >&2; exit 1 ;; esac
git push -u origin main
printf 'Repositório: https://github.com/%s\n' "$repository"
printf 'Configure os environments e o OIDC antes de aprovar a etapa 8.\n'
