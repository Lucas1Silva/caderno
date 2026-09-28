/**
 * Servidor local: é o único componente que ESCREVE no disco, então os
 * testes olham primeiro para o que não pode acontecer — perder frontmatter,
 * gravar fora do vault, aceitar pedido de outra origem.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { criarServidor, montarNota } from '../tools/serve.mjs';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
let dir, srv, base;

/**
 * Vault de teste, montado aqui. Antes eu copiava o vault real — e os testes
 * quebravam assim que uma nota de verdade era escrita (a primeira foi a de
 * RAG). Teste do servidor não pode depender do que você estuda.
 */
const FIXTURE = {
  'Caderno.md': '---\nslug: caderno\nstatus: rascunho\n---\n',
  'Engenharia de IA/Engenharia de IA.md': '---\nslug: engenharia-de-ia\nstatus: vazio\nmatiz: [22, 95]\n---\n',
  'Engenharia de IA/Agentes/Agentes.md': '---\nslug: agentes\nstatus: vazio\n---\n',
  'Engenharia de IA/Agentes/MCP.md':
    '---\nslug: mcp\nstatus: vazio\nrelacionados:\n  - "[[Contrato e versionamento]]"\n---\n',
  'Engenharia de IA/Agentes/Tools.md': '---\nslug: tools\nstatus: vazio\n---\n',
  'Engenharia de IA/Agentes/Agents.md': '---\nslug: agents\nstatus: vazio\n---\n',
  'Arquitetura/Arquitetura.md': '---\nslug: arquitetura\nstatus: vazio\nmatiz: [185, 255]\n---\n',
  'Arquitetura/Interface/Interface.md': '---\nslug: interface\nstatus: vazio\n---\n',
  'Arquitetura/Interface/API.md': '---\nslug: api\nstatus: vazio\n---\n',
  'Arquitetura/Interface/Contrato e versionamento.md': '---\nslug: contrato-e-versionamento\nstatus: vazio\n---\n'
};

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'caderno-srv-'));
  for (const [rel, texto] of Object.entries(FIXTURE)) {
    const alvo = join(dir, 'vault', rel);
    await mkdir(dirname(alvo), { recursive: true });
    await writeFile(alvo, texto, 'utf8');
  }
  srv = criarServidor({
    vault: join(dir, 'vault'),
    saida: join(dir, 'caderno.gen.js'),
    raiz: RAIZ,
    porta: 0,
    log: { log() {}, error() {} }
  });
  const { porta } = await srv.iniciar();
  base = `http://127.0.0.1:${porta}`;
});

after(async () => {
  await srv.fechar();
  await rm(dir, { recursive: true, force: true });
});

const put = (slug, corpo) => fetch(`${base}/api/nota?slug=${slug}`, {
  method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo)
});

/** Pedido cru, sem a normalização de URL que o fetch faz. */
function cru(caminho, host) {
  return new Promise((ok, falha) => {
    const { hostname, port } = new URL(base);
    const r = request({ hostname, port, path: caminho, headers: { host: host ?? `127.0.0.1:${port}` } }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => ok({ status: res.statusCode, corpo: b }));
    });
    r.on('error', falha);
    r.end();
  });
}

test('ping anuncia que dá para editar', async () => {
  const r = await fetch(`${base}/api/ping`);
  assert.deepEqual(await r.json(), { ok: true, editavel: true });
});

test('serve .js com o MIME certo — sem depender do registro do Windows', async () => {
  const r = await fetch(`${base}/src/main.js`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/javascript/);
});

test('lê a nota crua', async () => {
  const d = await (await fetch(`${base}/api/nota?slug=mcp`)).json();
  assert.equal(d.status, 'vazio');
  assert.equal(d.corpo, '');
});

test('salvar grava o .md, preserva o frontmatter e devolve HTML e aresta nova', async () => {
  const r = await put('mcp', { corpo: '# Protocolo\r\nPadroniza o acesso a [[API]].\n\n\n', status: 'rascunho' });
  assert.equal(r.status, 200);
  const d = await r.json();

  assert.equal(d.nota.status, 'rascunho');
  assert.equal(d.nota.vazio, false);
  assert.match(d.nota.html, /<h2>Protocolo<\/h2>/);
  assert.match(d.nota.html, /data-slug="api"/);
  assert.ok(d.cross.some((p) => p.includes('mcp') && p.includes('api')), 'a aresta MCP–API nasceu');
  assert.equal(d.meta.porStatus.rascunho, 1);

  const disco = await readFile(join(dir, 'vault/Engenharia de IA/Agentes/MCP.md'), 'utf8');
  assert.equal(disco,
    '---\nslug: mcp\nstatus: rascunho\nrelacionados:\n  - "[[Contrato e versionamento]]"\n---\n' +
    '# Protocolo\nPadroniza o acesso a [[API]].\n');
});

test('apagar o texto volta a nota para vazia, e a aresta escrita some', async () => {
  const d = await (await put('mcp', { corpo: '' })).json();
  assert.equal(d.nota.vazio, true);
  assert.ok(!d.cross.some((p) => p.includes('mcp') && p.includes('api')));
  // a de `relacionados` continua: não foi o texto que a criou
  assert.ok(d.cross.some((p) => p.includes('mcp') && p.includes('contrato-e-versionamento')));
});

test('duas gravações simultâneas em notas diferentes: as duas ficam', async () => {
  const [a, b] = await Promise.all([put('tools', { corpo: 'um' }), put('agents', { corpo: 'dois' })]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  const d = await (await fetch(`${base}/api/nota?slug=tools`)).json();
  assert.equal(d.corpo.trim(), 'um');
});

test('recusa status inválido, slug inexistente e corpo ausente', async () => {
  assert.equal((await put('mcp', { corpo: 'x', status: 'quase' })).status, 400);
  assert.equal((await put('nao-existe', { corpo: 'x' })).status, 404);
  assert.equal((await put('mcp', {})).status, 400);
});

test('recusa Host estranho (DNS rebinding)', async () => {
  const r = await cru('/api/ping', 'atacante.exemplo:80');
  assert.equal(r.status, 403);
});

test('não serve nada fora da pasta do projeto', async () => {
  const r = await cru('/..%2f..%2f..%2fetc%2fpasswd');
  assert.ok(r.status === 403 || r.status === 404, `status ${r.status}`);
  assert.ok(!r.corpo.includes('root:'));
});

test('montarNota: preserva chaves desconhecidas e comentários; cria frontmatter se faltar', () => {
  const antes = '---\n# minha anotação\nslug: x\nautor: eu\nstatus: vazio\n---\nvelho';
  assert.equal(montarNota(antes, { corpo: 'novo', status: 'estudado', slug: 'x' }),
    '---\n# minha anotação\nslug: x\nautor: eu\nstatus: estudado\n---\nnovo\n');
  assert.equal(montarNota('só texto', { corpo: 'a', slug: 'y' }),
    '---\nslug: y\nstatus: vazio\n---\na\n');
  assert.equal(montarNota(null, { corpo: '', slug: 'z' }),
    '---\nslug: z\nstatus: vazio\n---\n');
});

/* ---- criar notas ---- */

const post = (pai, nome) => fetch(`${base}/api/nota`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pai, nome })
});
const noVault = (rel) => join(dir, 'vault', rel);
const existe = (rel) => readFile(noVault(rel)).then(() => true, () => false);

test('criar tópico numa sub-área: arquivo novo e resposta com árvore', async () => {
  const r = await post('agentes', 'Planejamento');
  assert.equal(r.status, 201);
  const d = await r.json();
  assert.equal(d.nota.slug, 'planejamento');
  assert.equal(d.nota.profundidade, 3);
  assert.equal(d.arquivo, 'Engenharia de IA/Agentes/Planejamento.md');
  assert.equal(d.promovido, null);
  assert.equal(await readFile(noVault(d.arquivo), 'utf8'), '---\nslug: planejamento\nstatus: vazio\n---\n');
  const agentes = d.tree.children.find((x) => x.slug === 'engenharia-de-ia').children.find((x) => x.slug === 'agentes');
  assert.ok(agentes.children.some((x) => x.slug === 'planejamento'));
});

test('criar filho de um tópico promove o tópico a pasta, sem perder texto nem links', async () => {
  await put('api', { corpo: 'Contrato entre sistemas.', status: 'rascunho' });
  const r = await post('api', 'REST');
  assert.equal(r.status, 201);
  const d = await r.json();
  assert.equal(d.promovido, 'Arquitetura/Interface/API/API.md');
  assert.equal(await existe('Arquitetura/Interface/API.md'), false, 'o arquivo antigo saiu do lugar');
  const movido = await readFile(noVault('Arquitetura/Interface/API/API.md'), 'utf8');
  assert.match(movido, /slug: api\nstatus: rascunho/);
  assert.match(movido, /Contrato entre sistemas\./);
  assert.ok(await existe('Arquitetura/Interface/API/REST.md'));
});

test('salvar um tópico logo depois de promovido grava no caminho novo', async () => {
  const r = await put('api', { corpo: 'Versão 2.' });
  assert.equal(r.status, 200);
  assert.match(await readFile(noVault('Arquitetura/Interface/API/API.md'), 'utf8'), /Versão 2\./);
  assert.equal(await existe('Arquitetura/Interface/API.md'), false, 'não recria o arquivo no lugar antigo');
});

test('criar domínio na raiz: arquivo com matiz num arco livre', async () => {
  const d = await (await post('caderno', 'Python')).json();
  assert.equal(d.arquivo, 'Python.md');
  const texto = await readFile(noVault('Python.md'), 'utf8');
  const [, a, b] = texto.match(/matiz: \[(\d+), (\d+)\]/).map(Number);
  assert.ok(b < 22 || a > 95, 'não invade Engenharia de IA');
  assert.ok(b < 185 || a > 255, 'não invade Arquitetura');
  assert.deepEqual(d.tree.children.find((x) => x.slug === 'python').hue, [a, b]);
});

test('criar recusa nome repetido, nome inválido e pai inexistente — sem tocar no disco', async () => {
  const antes = await readFile(noVault('Engenharia de IA/Agentes/MCP.md'), 'utf8');
  assert.equal((await post('caderno', 'mcp')).status, 409);
  assert.equal((await post('caderno', 'a/b')).status, 400);
  assert.equal((await post('caderno', '_rascunho')).status, 400);
  assert.equal((await post('sumiu', 'X')).status, 404);
  assert.equal(await readFile(noVault('Engenharia de IA/Agentes/MCP.md'), 'utf8'), antes);
  assert.equal(await existe('_rascunho.md'), false);
});

test('se o caderno recusar a nota depois de criada, tudo é desfeito', async () => {
  // Um nome com mojibake passa na validação mas o leitor do vault o recusa:
  // o servidor tem que apagar o arquivo e devolver o tópico ao lugar.
  const r = await post('tools', 'Consist├¬ncia');
  assert.equal(r.status, 400);
  assert.match((await r.json()).erro, /recusou/);
  assert.equal(await existe('Engenharia de IA/Agentes/Tools/Consist├¬ncia.md'), false);
  assert.equal(await existe('Engenharia de IA/Agentes/Tools.md'), true, 'a promoção foi desfeita');
  assert.equal(await existe('Engenharia de IA/Agentes/Tools/Tools.md'), false);
  // e o servidor continua funcionando
  assert.equal((await post('tools', 'Function calling')).status, 201);
});
