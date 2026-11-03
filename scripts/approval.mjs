import { writeFile } from 'node:fs/promises';

const repository = process.env.GITHUB_REPOSITORY;
const run = process.env.GITHUB_RUN_ID;
if (!repository || !run) throw new Error('Contexto do GitHub Actions ausente.');
const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28' };
const response = await fetch(`https://api.github.com/repos/${repository}/actions/runs/${run}/approvals`, { headers });
if (!response.ok) throw new Error(`Não foi possível consultar a aprovação: HTTP ${response.status}`);
const history = await response.json();
const approval = history.find(item => item.state === 'approved' && item.environments.some(environment => environment.name === 'producao'));
if (!approval) throw new Error('Não há aprovação registrada para o environment producao.');
await writeFile('reports/08-producao/aprovacao.json', JSON.stringify(approval, null, 2) + '\n');
console.log(`Aprovação registrada por ${approval.user.login}.`);
