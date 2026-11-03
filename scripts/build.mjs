import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

let commit = process.env.GITHUB_SHA;
if (!commit) {
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    commit = 'local-sem-commit';
  }
}
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('src', 'dist', { recursive: true });
await writeFile('dist/package.json', JSON.stringify({ name: 'operacao-blackout-devsecops', version: '1.0.0', type: 'module' }, null, 2) + '\n');
await writeFile('dist/version.json', JSON.stringify({ application: 'operacao-blackout', commit }, null, 2) + '\n');
console.log(`Build concluído: ${commit}`);
