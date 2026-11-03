import { readFile, writeFile } from 'node:fs/promises';

const files = ['reports/02-semgrep/semgrep-servidor.json', 'reports/02-semgrep/semgrep-cliente.json'];
const reports = await Promise.all(files.map(async path => JSON.parse(await readFile(path, 'utf8'))));
const merged = {
  version: reports[0].version,
  results: reports.flatMap(report => report.results || []),
  errors: reports.flatMap(report => report.errors || []),
  paths: { scanned: [...new Set(reports.flatMap(report => report.paths?.scanned || []))] }
};
await writeFile('reports/02-semgrep/semgrep.json', JSON.stringify(merged, null, 2) + '\n');
