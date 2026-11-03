set -euo pipefail
root="$(pwd)"
dir="$root/reports/gate-demo"
mkdir -p "$dir"
temp="$(mktemp -d)"
trap 'rm -rf -- "$temp"' EXIT
git -C "$temp" init -b teste/segredo-ficticio > /dev/null
git -C "$temp" config user.name 'Demonstração local'
git -C "$temp" config user.email 'demo@localhost'
node -e "const fs=require('fs'),c=require('crypto');fs.writeFileSync(process.argv[1], 'github_token='+['ghp',c.randomBytes(18).toString('hex')].join('_')+'\n')" "$temp/credencial-ficticia.txt"
git -C "$temp" add .
git -C "$temp" commit -m 'Introduz credencial fictícia para verificar o gate' > /dev/null
image="$(node -p "JSON.parse(require('fs').readFileSync('config/toolchain.json')).gitleaks")"
set +e
docker run --rm -v "$temp:/repo" -v "$dir:/reports" "$image" git /repo --redact --exit-code 1 --report-format json --report-path /reports/bloqueado.json > "$dir/bloqueado.log" 2>&1
blocked=$?
set -e
test "$blocked" -eq 1
git -C "$temp" rm credencial-ficticia.txt > /dev/null
git -C "$temp" commit -m 'Remove o arquivo apenas do último commit' > /dev/null
set +e
docker run --rm -v "$temp:/repo" -v "$dir:/reports" "$image" git /repo --redact --exit-code 1 --report-format json --report-path /reports/historico.json > "$dir/historico.log" 2>&1
history=$?
set -e
test "$history" -eq 1
git -C "$temp" checkout --orphan correcao/sem-segredo > /dev/null 2>&1
printf 'Repositório limpo de demonstração.\n' > "$temp/README.md"
git -C "$temp" add .
git -C "$temp" commit -m 'Cria histórico limpo depois de tratar o segredo fictício' > /dev/null
docker run --rm -v "$temp:/repo" -v "$dir:/reports" "$image" git /repo --log-opts HEAD --redact --exit-code 1 --report-format json --report-path /reports/corrigido.json > "$dir/corrigido.log" 2>&1
printf '{"contexto":"experimento local em repositório temporário","bloqueado":%s,"apagar_ultimo_commit":%s,"corrigido":0}\n' "$blocked" "$history" > "$dir/resultado.json"
cat "$dir/resultado.json"
