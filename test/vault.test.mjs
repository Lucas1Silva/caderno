import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readVault, slugify } from '../tools/lib/vault.mjs';

async function vaultFalso(arquivos) {
  const dir = await mkdtemp(join(tmpdir(), 'caderno-'));
  for (const [caminho, texto] of Object.entries(arquivos)) {
    await mkdir(dirname(join(dir, caminho)), { recursive: true });
    await writeFile(join(dir, caminho), texto, 'utf8');
  }
  return dir;
}

test('slugify remove acento e pontuação', () => {
  assert.equal(slugify('Consistência de dados'), 'consistencia-de-dados');
  assert.equal(slugify('Inference (online vs. batch)'), 'inference-online-vs-batch');
  assert.equal(slugify('SLI, SLO e SLA'), 'sli-slo-e-sla');
});

test('pasta é hierarquia; nota-de-pasta tem o nome da pasta', async () => {
  const dir = await vaultFalso({
    'Caderno.md': '---\nslug: caderno\n---\n',
    'IA/IA.md': '---\nslug: ia\nmatiz: [22, 95]\n---\n',
    'IA/Agentes/Agentes.md': '---\nslug: agentes\nordem: 1\n---\n',
    'IA/Agentes/MCP.md': '---\nslug: mcp\nstatus: estudado\n---\nTexto sobre [[Tools]].',
    'IA/Agentes/Tools.md': '---\nslug: tools\n---\n'
  });
  try {
    const r = await readVault(dir);
    assert.deepEqual(r.errors, []);
    assert.equal(r.tree.label, 'Caderno');
    const ia = r.tree.children[0];
    assert.equal(ia.label, 'IA');
    assert.deepEqual(ia.hue, [22, 95]);
    const ag = ia.children[0];
    assert.deepEqual(ag.children.map((c) => c.label), ['MCP', 'Tools']);
    const mcp = ag.children[0];
    assert.equal(mcp.status, 'estudado');
    assert.equal(mcp.vazio, false);
    assert.match(mcp.html, /data-slug="tools"/);
    assert.deepEqual(r.cross, [['mcp', 'tools']]);
  } finally { await rm(dir, { recursive: true }); }
});

test('links no frontmatter também são arestas; parentesco não duplica', async () => {
  const dir = await vaultFalso({
    'Caderno.md': '',
    'D/D.md': '---\nslug: d\nrelacionados:\n  - "[[A]]"\n---\n',
    'D/A.md': '---\nslug: a\nrelacionados:\n  - "[[B]]"\n  - "[[B]]"\n---\n',
    'D/B.md': '---\nslug: b\n---\nvolta para [[A]]'
  });
  try {
    const r = await readVault(dir);
    // D→A é pai→filho (ignorado); A↔B aparece uma vez só, apesar de três menções
    assert.deepEqual(r.cross, [['a', 'b']]);
  } finally { await rm(dir, { recursive: true }); }
});

test('prefixo _ e . é ignorado: _raw, _templates, .obsidian', async () => {
  const dir = await vaultFalso({
    'Caderno.md': '',
    '_raw/artigo.md': 'material bruto',
    '_templates/Nota.md': '---\nslug:\n---\n',
    '.obsidian/app.json': '{}',
    'D/D.md': '---\nslug: d\nmatiz: [0, 50]\n---\n'
  });
  try {
    const r = await readVault(dir);
    assert.deepEqual(r.notes.map((n) => n.label).sort(), ['Caderno', 'D']);
  } finally { await rm(dir, { recursive: true }); }
});

test('nome repetido e slug repetido são erros', async () => {
  const dir = await vaultFalso({
    'Caderno.md': '',
    'A/A.md': '---\nmatiz: [0,50]\n---\n', 'A/X.md': '---\nslug: um\n---\n',
    'B/B.md': '---\nmatiz: [100,150]\n---\n', 'B/X.md': '---\nslug: dois\n---\n',
    'B/Y.md': '---\nslug: um\n---\n'
  });
  try {
    const r = await readVault(dir);
    assert.ok(r.errors.some((e) => e.includes('nome repetido "X"')));
    assert.ok(r.errors.some((e) => e.includes('slug repetido "um"')));
  } finally { await rm(dir, { recursive: true }); }
});

test('avisos: sem slug, status inválido, link quebrado, domínio sem matiz', async () => {
  const dir = await vaultFalso({
    'Caderno.md': '---\nslug: caderno\n---\n',
    'D/D.md': '---\nslug: d\n---\n',
    'D/N.md': '---\nstatus: quase\n---\nver [[Nada]]'
  });
  try {
    const r = await readVault(dir);
    const w = r.warnings.join('\n');
    assert.match(w, /D\/N\.md: sem slug gravado/);
    assert.match(w, /status "quase" desconhecido/);
    assert.match(w, /link quebrado \[\[Nada\]\]/);
    assert.match(w, /domínio sem "matiz" — atribuído/);
    assert.ok(Array.isArray(r.tree.children[0].hue), 'domínio recebe arco mesmo sem declarar');
  } finally { await rm(dir, { recursive: true }); }
});

test('matiz fora de domínio é ignorado com aviso', async () => {
  const dir = await vaultFalso({
    'Caderno.md': '',
    'D/D.md': '---\nslug: d\nmatiz: [0,50]\n---\n',
    'D/S/S.md': '---\nslug: s\nmatiz: [200,250]\n---\n'
  });
  try {
    const r = await readVault(dir);
    assert.match(r.warnings.join('\n'), /"matiz" só vale em domínio/);
    assert.equal(r.tree.children[0].children[0].hue, undefined);
  } finally { await rm(dir, { recursive: true }); }
});

test('o vault real do projeto constrói sem erro', async () => {
  // Só ERROS falham aqui (nome ou slug repetido: o grafo ficaria ambíguo).
  // Avisos — link para nota que ainda não existe, slug não gravado — são
  // parte normal de escrever, e não podem deixar o CI vermelho.
  const r = await readVault(fileURLToPath(new URL('../vault', import.meta.url)));
  assert.deepEqual(r.errors, []);
  assert.ok(r.tree.children.length >= 1, 'ao menos um domínio');
});

test('nome decomposto (NFD, do macOS) resolve link escrito composto (NFC)', async () => {
  const nfd = 'Consistência'.normalize('NFD');
  const dir = await vaultFalso({
    'Caderno.md': '',
    'D/D.md': '---\nslug: d\nmatiz: [0,50]\n---\n',
    [`D/${nfd}.md`]: '---\nslug: consistencia\n---\n',
    'D/X.md': '---\nslug: x\n---\nver [[Consistência]]'
  });
  try {
    const r = await readVault(dir);
    assert.ok(!r.warnings.some((w) => w.includes('link quebrado')), r.warnings.join('\n'));
    assert.deepEqual(r.cross, [['x', 'consistencia']]);
  } finally { await rm(dir, { recursive: true }); }
});

test('nome corrompido por extração errada do zip é erro, com instrução', async () => {
  const dir = await vaultFalso({
    'Caderno.md': '',
    'D/D.md': '---\nslug: d\nmatiz: [0,50]\n---\n',
    'D/Consist├¬ncia de dados.md': '---\nslug: c\n---\n'
  });
  try {
    const r = await readVault(dir);
    assert.ok(r.errors.some((e) => e.includes('nome de arquivo corrompido') && e.includes('7-Zip')));
  } finally { await rm(dir, { recursive: true }); }
});
