set -euo pipefail
stage="${1:?Informe secrets, sast, sca, image ou zap}"
root="$(pwd)"
mkdir -p reports
tool() { node -p "JSON.parse(require('fs').readFileSync('config/toolchain.json','utf8')).$1"; }
case "$stage" in
  secrets)
    dir=reports/01-gitleaks
    mkdir -p "$dir"
    docker run --rm -v "$root:/repo" "$(tool gitleaks)" git /repo --redact --exit-code 1 --report-format json --report-path /repo/"$dir"/gitleaks.json 2>&1 | tee "$dir/execucao.log"
    ;;
  sast)
    dir=reports/02-semgrep
    mkdir -p "$dir"
    mkdir -p .sast-input
    docker run --rm -v "$root:/repo" -w /repo node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 sh -c 'npm ci --ignore-scripts && node_modules/.bin/prettier src/public/blackout/assets/index-D5b49BWm.js > .sast-input/blackout.js' 2>&1 | tee "$dir/preparacao.log"
    cp .sast-input/blackout.js "$dir/blackout-formatado.js"
    sha256sum src/public/blackout/assets/index-D5b49BWm.js .sast-input/blackout.js > "$dir/entradas.sha256"
    set +e
    docker run --rm -v "$root:/src" -w /src "$(tool semgrep)" semgrep scan --config p/default --config p/owasp-top-ten --no-git-ignore --metrics off --error --strict --json --output "$dir/semgrep-servidor.json" --exclude src/public/blackout/assets/index-D5b49BWm.js src scripts test 2>&1 | tee "$dir/execucao.log"
    server_code=${PIPESTATUS[0]}
    docker run --rm -v "$root:/src" -w /src "$(tool semgrep)" semgrep scan --config p/default --config p/owasp-top-ten --config p/react --no-git-ignore --max-target-bytes 10000000 --timeout 10 --metrics off --error --json --output "$dir/semgrep-cliente.json" .sast-input 2>&1 | tee -a "$dir/execucao.log"
    client_code=${PIPESTATUS[0]}
    set -e
    node scripts/merge-semgrep.mjs
    if [ "$server_code" -ne 0 ] || [ "$client_code" -ne 0 ]; then exit 1; fi
    ;;
  sca)
    dir=reports/04-trivy-sca
    mkdir -p "$dir"
    docker run --rm -v "$root:/repo" -v blackout-trivy-cache:/root/.cache/trivy -w /repo "$(tool trivy)" fs --include-dev-deps --scanners vuln,misconfig,secret --skip-dirs .git,docs,reports,dist,work,tools,output --format table --output "$dir/trivy-fs.txt" --exit-code 0 . 2>&1 | tee "$dir/execucao.log"
    docker run --rm -v "$root:/repo" -v blackout-trivy-cache:/root/.cache/trivy -w /repo "$(tool trivy)" sbom --scanners vuln --format table --output "$dir/trivy-bundle.txt" --exit-code 0 config/bundle.cdx.json 2>&1 | tee -a "$dir/execucao.log"
    docker run --rm -v "$root:/repo" -v blackout-trivy-cache:/root/.cache/trivy -w /repo "$(tool trivy)" sbom --scanners vuln --severity HIGH,CRITICAL --format json --output "$dir/trivy-bundle.json" --exit-code 1 config/bundle.cdx.json 2>&1 | tee -a "$dir/execucao.log"
    docker run --rm -v "$root:/repo" -v blackout-trivy-cache:/root/.cache/trivy -w /repo "$(tool trivy)" fs --include-dev-deps --scanners vuln,misconfig,secret --skip-dirs .git,docs,reports,dist,work,tools,output --severity HIGH,CRITICAL --format json --output "$dir/trivy-fs.json" --exit-code 1 . 2>&1 | tee -a "$dir/execucao.log"
    ;;
  image)
    dir=reports/06-trivy-image
    mkdir -p "$dir"
    image="${IMAGE_REF:?Informe IMAGE_REF}"
    docker run --rm -e TRIVY_USERNAME -e TRIVY_PASSWORD -v "$root:/repo" -v blackout-trivy-cache:/root/.cache/trivy -w /repo "$(tool trivy)" image --image-src remote --scanners vuln --format table --output "$dir/trivy-image.txt" --exit-code 0 "$image" 2>&1 | tee "$dir/execucao.log"
    docker run --rm -e TRIVY_USERNAME -e TRIVY_PASSWORD -v "$root:/repo" -v blackout-trivy-cache:/root/.cache/trivy -w /repo "$(tool trivy)" image --image-src remote --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --format json --output "$dir/trivy-image.json" --exit-code 1 "$image" 2>&1 | tee -a "$dir/execucao.log"
    ;;
  zap)
    dir=reports/07-homologacao-zap
    mkdir -p "$dir"
    chmod 777 "$dir"
    target="${ZAP_TARGET:-http://127.0.0.1:3000}"
    set +e
    docker run --rm --network host -v "$root/$dir:/zap/wrk:rw" "$(tool zap)" zap-baseline.py -t "$target" -m 1 -T 5 -r report_html.html -J report_json.json -w report_md.md 2>&1 | tee "$dir/execucao.log"
    code=${PIPESTATUS[0]}
    set -e
    printf '{"exit_code":%s,"informativo":true}\n' "$code" > "$dir/zap-status.json"
    if [ "$code" -gt 2 ] || [ ! -s "$dir/report_json.json" ]; then
      printf 'Falha operacional do ZAP: %s\n' "$code" >&2
      exit 1
    fi
    ;;
  *) exit 2 ;;
esac
