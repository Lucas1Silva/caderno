import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { validarNome, planejarCriacao, TAMANHO_MAXIMO } from '../tools/lib/criar.mjs';
import { readVault } from '../tools/lib/vault.mjs';

test('validarNome: limpa espaços e normaliza Unicode', () => {
  assert.equal(validarNome('  Arquitetura   RAG  '), 'Arquitetura RAG');
  assert.equal(validarNome('Consistência'), 'Consistência');   // decomposto → composto
});

test('validarNome: recusa com a explicação do conserto', () => {
  const casos = [
    ['', /Falta o nome/],
    ['   ', /Falta o nome/],
    [null, /Falta o nome/],
    ['a/b', /"\/"/],
    ['a:b', /":"/],
    ['p50|p95', /"\|"/],
    ['[[x]]', /links/],
    ['Seção#1', /links/],
    ['_raw', /começar com/],
    ['.oculto', /começar com/],
    ['fim.', /terminar em ponto/],
    ['CON', /reservado/],
    ['lpt1.md', /reservado/],
    ['tab\there', null],                 // tab vira espaço: é aceito
    ['x'.repeat(TAMANHO_MAXIMO + 1), /limite/]
  ];
  for (const [nome, esperado] of casos) {
    if (esperado === null) { assert.doesNotThrow(() => validarNome(nome)); continue; }
    assert.throws(() => validarNome(nome), (e) => e.status === 400 && esperado.test(e.message), JSON.stringify(nome));
  }
});

async function vaultFalso(arquivos) {
  const dir = await mkdtemp(join(tmpdir(), 'criar-'));
  for (const [rel, texto] of Object.entries(arquivos)) {
    await mkdir(dirname(join(dir, rel)), { recursive: true });
    await writeFile(join(dir, rel), texto, 'utf8');
  }
  return dir;
}

const BASE = {
  'Caderno.md': '---\nslug: caderno\n---\n',
  'IA/IA.md': '---\nslug: ia\nmatiz: [22, 95]\n---\n',
  'IA/Busca/Busca.md': '---\nslug: busca\n---\n',
  'IA/Busca/RAG.md': '---\nslug: rag\n---\n',
  'IA/Solto.md': '---\nslug: solto\n---\n'
};

test('planejar: filho de pasta, filho de tópico (promoção) e domínio novo', async () => {
  const dir = await vaultFalso(BASE);
  try {
    const estado = await readVault(dir);

    const a = planejarCriacao(estado, { pai: 'busca', nome: 'Re-rank' });
    assert.equal(a.arquivo, 'IA/Busca/Re-rank.md');
    assert.equal(a.promover, null);
    assert.equal(a.slug, 're-rank');
    assert.equal(a.profundidade, 3);
    assert.match(a.conteudo, /^---\nslug: re-rank\nstatus: vazio\n---\n$/);

    const b = planejarCriacao(estado, { pai: 'rag', nome: 'Naive RAG' });
    assert.deepEqual(b.promover, { de: 'IA/Busca/RAG.md', para: 'IA/Busca/RAG/RAG.md', pasta: 'IA/Busca/RAG' });
    assert.equal(b.arquivo, 'IA/Busca/RAG/Naive RAG.md');

    const c = planejarCriacao(estado, { pai: 'solto', nome: 'Filho' });
    assert.equal(c.promover.para, 'IA/Solto/Solto.md', 'tópico direto no domínio também promove');

    const d = planejarCriacao(estado, { pai: 'caderno', nome: 'Python' });
    assert.equal(d.arquivo, 'Python.md');
    assert.equal(d.profundidade, 1);
    assert.ok(d.matiz, 'domínio novo ganha arco de cor');
    assert.ok(d.matiz[0] > 95 || d.matiz[1] < 22, `arco ${d.matiz} não pode invadir o de IA`);
    assert.match(d.conteudo, /matiz: \[\d+, \d+\]/);
  } finally { await rm(dir, { recursive: true }); }
});

test('planejar: nome repetido é 409, pai inexistente é 404, slug repetido ganha sufixo', async () => {
  const dir = await vaultFalso(BASE);
  try {
    const estado = await readVault(dir);
    assert.throws(() => planejarCriacao(estado, { pai: 'busca', nome: 'rag' }), (e) => e.status === 409 && /IA\/Busca\/RAG\.md/.test(e.message));
    assert.throws(() => planejarCriacao(estado, { pai: 'sumiu', nome: 'X' }), (e) => e.status === 404);
    assert.equal(planejarCriacao(estado, { pai: 'busca', nome: 'RAG!' }).slug, 'rag-2');
  } finally { await rm(dir, { recursive: true }); }
});
