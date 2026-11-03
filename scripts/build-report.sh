set -euo pipefail
dir=reports/03-build
mkdir -p "$dir"
npm ci --ignore-scripts 2>&1 | tee "$dir/instalacao.txt"
npm ls --all > "$dir/arvore-dependencias.txt"
set +e
npm audit --json > "$dir/npm-audit.json"
audit_code=$?
set -e
if [ "$audit_code" -gt 1 ]; then exit "$audit_code"; fi
npm test 2>&1 | tee "$dir/testes.txt"
npm run build 2>&1 | tee "$dir/build.txt"
sha="${GITHUB_SHA:-$(git rev-parse HEAD)}"
tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner -czf "$dir/blackout-$sha.tar.gz" -C dist .
node -e "const fs=require('fs'),c=require('crypto'),p=process.argv[1];fs.writeFileSync(p+'.sha256',c.createHash('sha256').update(fs.readFileSync(p)).digest('hex')+'  '+p.split('/').pop()+'\n')" "$dir/blackout-$sha.tar.gz"
