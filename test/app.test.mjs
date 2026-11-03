import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createApp } from '../src/server.mjs';

let server;
let base;
before(async () => {
  server = createApp();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => new Promise(resolve => server.close(resolve)));

test('a raiz e o caminho original abrem o jogo do Challenge', async () => {
  for (const path of ['/', '/blackout', '/blackout/']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Operação Blackout/);
    assert.match(html, /index-D5b49BWm.js/);
    assert.match(html, /id="root"/);
  }
});

test('o health check identifica o jogo e a versão em execução', async () => {
  const response = await fetch(base + '/health');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.status, 'ok');
  assert.equal(data.application, 'operacao-blackout');
  assert.ok(data.version);
});

test('entrega os assets com tipo de conteúdo correto', async () => {
  for (const [path, type] of [
    ['/blackout/assets/index-D5b49BWm.js', 'text/javascript'],
    ['/blackout/assets/index-2Gsa3GjI.css', 'text/css'],
    ['/blackout/favicon.svg', 'image/svg+xml']
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type').startsWith(type));
    assert.ok((await response.text()).length > 1000);
  }
});

test('os arquivos do jogo mantêm os hashes de origem registrados', async () => {
  const inventory = JSON.parse(await readFile(new URL('../config/origem-jogo.json', import.meta.url)));
  for (const file of inventory.files) {
    const content = await readFile(new URL('../' + file.destination, import.meta.url));
    assert.equal(createHash('sha256').update(content).digest('hex'), file.sha256);
  }
});

test('inclui os cabeçalhos de segurança também em erros', async () => {
  for (const path of ['/', '/health', '/nao-existe']) {
    const response = await fetch(base + path);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('cross-origin-embedder-policy'), 'require-corp');
    assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(response.headers.get('server'), null);
    assert.equal(response.headers.get('set-cookie'), null);
  }
});

test('não libera arquivos internos, dotfiles nem travessia de diretórios', async () => {
  for (const path of ['/package.json', '/server.mjs', '/.env', '/.git/config', '/%2e%2e%2fserver.mjs', '/blackout/.htaccess']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
});

test('recusa métodos de escrita sem criar estado no servidor', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await fetch(base + '/', { method });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
  }
});

test('HEAD retorna somente cabeçalhos com o mesmo tamanho do recurso', async () => {
  const get = await fetch(base + '/');
  const head = await fetch(base + '/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), get.headers.get('content-length'));
  assert.equal(await head.text(), '');
});

test('uma query string não muda o asset e respostas não refletem HTML recebido', async () => {
  const response = await fetch(base + '/blackout/assets/index-2Gsa3GjI.css?v=1');
  assert.equal(response.status, 200);
  const invalid = await fetch(base + '/%3Cscript%3Ealert(1)%3C/script%3E');
  assert.equal(invalid.status, 404);
  assert.equal((await invalid.json()).error, 'Página não encontrada.');
});

test('recusa percent encoding inválido sem expor detalhes internos', async () => {
  const response = await fetch(base + '/%ZZ');
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Requisição inválida.');
});
