set -euo pipefail
root="${1:-reports}"
output="${2:-reports/resumo-esteira.md}"
mkdir -p "$(dirname "$output")"
count() {
  local path="$1" expression="$2"
  if [ ! -s "$path" ] && [ -s "$root/$(basename "$path")" ]; then path="$root/$(basename "$path")"; fi
  if [ -s "$path" ]; then jq -r "$expression" "$path"; else printf 'indisponível'; fi
}
secrets="$(count "$root/relatorio-01-gitleaks/gitleaks.json" 'length')"
sast="$(count "$root/relatorio-02-semgrep/semgrep.json" '.results | length')"
sast_warnings="$(count "$root/relatorio-02-semgrep/semgrep.json" '.errors | length')"
audit="$(count "$root/relatorio-03-build/npm-audit.json" '.metadata.vulnerabilities.total')"
sca="$(count "$root/relatorio-04-trivy-sca/trivy-fs.json" '[.Results[]? | (.Vulnerabilities[]?, .Misconfigurations[]?, .Secrets[]?)] | length')"
bundle="$(count "$root/relatorio-04-trivy-sca/trivy-bundle.json" '[.Results[]? | .Vulnerabilities[]?] | length')"
image="$(count "$root/relatorio-06-trivy-image/trivy-image.json" '[.Results[]? | .Vulnerabilities[]?] | length')"
zap="$(count "$root/relatorio-07-homologacao-zap/report_json.json" '[.site[]? | .alerts[]? | select(.riskcode == "3")] | length')"
zap_medium="$(count "$root/relatorio-07-homologacao-zap/report_json.json" '[.site[]? | .alerts[]? | select(.riskcode == "2")] | length')"
docker_detail='Sem publicação confirmada nesta execução'
if [ "${DOCKER_RESULT:-}" = success ]; then docker_detail='Imagem e digest no relatório'; fi
production_detail='Registro de aprovação indisponível nos artifacts; deploy não confirmado'
if [ -s "$root/relatorio-08-producao/aprovacao.json" ]; then
  reviewer="$(jq -r '.user.login' "$root/relatorio-08-producao/aprovacao.json")"
  production_detail="Aprovado por $reviewer; consultar o relatório de produção"
fi
{
  printf '# Resumo da Esteira\n\n'
  printf 'Commit: `%s`\n\n' "${GITHUB_SHA:-local}"
  printf 'Execução: %s\n\n' "${RUN_URL:-validação local}"
  printf '| Etapa | Resultado | Achados |\n| --- | --- | --- |\n'
  printf '| 1. Gitleaks | %s | %s segredos |\n' "${SECRETS_RESULT:-não executado}" "$secrets"
  printf '| 2. Semgrep | %s | %s achados; %s avisos de cobertura/operação |\n' "${SAST_RESULT:-não executado}" "$sast" "$sast_warnings"
  printf '| 3. Build e dependências | %s | %s vulnerabilidades no npm audit |\n' "${BUILD_RESULT:-não executado}" "$audit"
  printf '| 4. Trivy fs e bundle | %s | %s no projeto; %s no inventário parcial HIGH/CRITICAL |\n' "${SCA_RESULT:-não executado}" "$sca" "$bundle"
  printf '| 5. Docker e GHCR | %s | %s |\n' "${DOCKER_RESULT:-não executado}" "$docker_detail"
  printf '| 6. Trivy image | %s | %s HIGH/CRITICAL corrigíveis |\n' "${IMAGE_RESULT:-não executado}" "$image"
  printf '| 7. Homologação e ZAP | %s | %s High; %s Medium |\n' "${DAST_RESULT:-não executado}" "$zap" "$zap_medium"
  printf '| 8. Aprovação e produção | %s | %s |\n' "${PROD_RESULT:-não executado}" "$production_detail"
  printf '\nRelatórios ausentes aparecem como indisponíveis. Etapas puladas não equivalem a resultado limpo.\n'
} > "$output"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then cat "$output" >> "$GITHUB_STEP_SUMMARY"; fi
