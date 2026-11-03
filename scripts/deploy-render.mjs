import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const apiKey = process.env.RENDER_API_KEY;
const ownerId = process.env.RENDER_OWNER_ID;
const serviceName = process.env.RENDER_SERVICE_NAME || 'operacao-blackout-rm565098-rm565963';
const image = process.env.IMAGE_REF;
const commit = process.env.GITHUB_SHA;
const repository = process.env.GITHUB_REPOSITORY?.toLowerCase();
if (!apiKey || !/^(tea|usr)-[a-z0-9]+$/.test(ownerId || '')) throw new Error('Configure RENDER_API_KEY e RENDER_OWNER_ID no environment producao.');
if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(serviceName)) throw new Error('Nome do serviço Render inválido.');
const prefix = `ghcr.io/${repository}@sha256:`;
if (!image?.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(image.slice(prefix.length))) throw new Error('O deploy exige o digest da imagem deste repositório.');
if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('SHA do commit ausente ou inválido.');

await mkdir('reports/08-producao', { recursive: true });
const approval = JSON.parse(await readFile('reports/08-producao/aprovacao.json', 'utf8'));
if (approval.state !== 'approved' || !approval.environments.some(environment => environment.name === 'producao')) throw new Error('Aprovação de produção não encontrada.');

async function api(path, method = 'GET', body) {
  const response = await fetch(`https://api.render.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1500).replaceAll(apiKey, '[redigido]');
    const error = new Error(`Render HTTP ${response.status}: ${detail}`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

const services = await api(`/services?ownerId=${encodeURIComponent(ownerId)}&name=${encodeURIComponent(serviceName)}&limit=100`);
let service = services.map(item => item.service).find(item => item.name === serviceName && item.ownerId === ownerId);
let deployId;
if (service) {
  if (service.type !== 'web_service' || service.serviceDetails.plan !== 'free' || service.serviceDetails.runtime !== 'image') throw new Error('O serviço existente precisa ser um web service gratuito baseado em imagem.');
  const result = await api(`/services/${encodeURIComponent(service.id)}/deploys`, 'POST', { imageUrl: image });
  deployId = result.id;
} else {
  try {
    const result = await api('/services', 'POST', {
      type: 'web_service',
      name: serviceName,
      ownerId,
      autoDeployTrigger: 'off',
      image: { imagePath: image, ownerId },
      envVars: [{ key: 'PORT', value: '3000' }],
      serviceDetails: { runtime: 'image', plan: 'free', region: 'oregon', numInstances: 1, healthCheckPath: '/health' }
    });
    service = result.service;
    deployId = result.deployId;
  } catch (error) {
    if (![500, 502, 503, 504].includes(error.status)) throw error;
    const current = await api(`/services?ownerId=${encodeURIComponent(ownerId)}&name=${encodeURIComponent(serviceName)}&limit=100`);
    service = current.map(item => item.service).find(item => item.name === serviceName && item.ownerId === ownerId);
    if (!service || service.type !== 'web_service' || service.serviceDetails.runtime !== 'image') throw error;
    console.log('O serviço foi criado apesar da resposta de erro; continuando com o recurso confirmado.');
  }
}
if (!service?.id) throw new Error('O Render não retornou o serviço.');
if (service.serviceDetails.plan !== 'free') throw new Error('O Render não confirmou o plano gratuito solicitado.');
if (!deployId) {
  const result = await api(`/services/${encodeURIComponent(service.id)}/deploys`, 'POST', { imageUrl: image });
  deployId = result.id;
}
if (!deployId) throw new Error('O Render não retornou o identificador do deploy.');

let deployed;
for (let attempt = 0; attempt < 120; attempt += 1) {
  deployed = await api(`/services/${encodeURIComponent(service.id)}/deploys/${encodeURIComponent(deployId)}`);
  console.log(`Deploy ${deployId}: ${deployed.status}`);
  if (deployed.status === 'live') break;
  if (deployed.status.endsWith('_failed') || ['canceled', 'deactivated'].includes(deployed.status)) throw new Error(`Deploy interrompido: ${deployed.status}`);
  await delay(5000);
}
if (deployed.status !== 'live') throw new Error('O Render não confirmou o deploy dentro do prazo.');
const digest = image.split('@')[1];
const resolvedDigest = deployed.image?.sha?.replace(/^sha256:/, '');
if (deployed.image?.ref !== image && resolvedDigest !== digest.slice(7)) throw new Error('O deploy retornado não corresponde ao digest aprovado.');

service = await api(`/services/${encodeURIComponent(service.id)}`);
const url = service.serviceDetails.url;
const production = new URL(url);
if (production.protocol !== 'https:' || !production.hostname.endsWith('.onrender.com')) throw new Error('URL de produção inesperada.');
let health;
for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(20000) });
    if (response.ok) {
      const result = await response.json();
      if (result.status === 'ok' && result.application === 'operacao-blackout' && result.version === commit) {
        health = result;
        break;
      }
    }
  } catch {}
  await delay(5000);
}
if (!health) throw new Error('A verificação HTTP não confirmou o commit aprovado em produção.');
const page = await fetch(url, { signal: AbortSignal.timeout(30000) });
if (!page.ok || !(await page.text()).includes('Operação Blackout')) throw new Error('A página do jogo não passou na verificação final.');
const evidence = { serviceId: service.id, name: service.name, plan: service.serviceDetails.plan, url, image, commit, deployId, status: deployed.status, imageEvidence: deployed.image, startedAt: deployed.startedAt, finishedAt: deployed.finishedAt };
await writeFile('reports/08-producao/render-deploy.json', JSON.stringify(evidence, null, 2) + '\n');
await writeFile('reports/08-producao/health.json', JSON.stringify(health, null, 2) + '\n');
const report = `# Deploy em produção\n\nProvedor: Render\n\nPlano: Free\n\nImagem: \`${image}\`\n\nCommit: \`${commit}\`\n\nAprovação: ${approval.user.login}\n\nDeploy concluído: ${deployed.finishedAt}\n\nURL: ${url}\n\nExecução: ${process.env.RUN_URL}\n\nVerificação: status live, digest aprovado, HTTP 200, página do Blackout e versão igual ao commit.\n`;
await writeFile('reports/08-producao/deploy-producao.md', report);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `url=${url}\n`);
console.log(`Produção confirmada: ${url}`);
