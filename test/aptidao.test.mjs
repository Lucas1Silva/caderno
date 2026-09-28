import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readVault } from '../tools/lib/vault.mjs';
import { cruzam, medir, pontuar, avaliar, PESOS, LIMIAR_PERTO } from '../tools/lib/aptidao.mjs';
import { gerarCaderno } from '../tools/lib/sintetico.mjs';
import { PARAMS_MANUAIS, mulberry32 } from '../src/params.js';

const P = (x, y) => ({ x, y });

test('cruzam: X cruza; paralelos, separados e ponta encostando não', () => {
  assert.equal(cruzam(P(0, 0), P(10, 10), P(0, 10), P(10, 0)), true);
  assert.equal(cruzam(P(0, 0), P(10, 0), P(0, 5), P(10, 5)), false);
  assert.equal(cruzam(P(0, 0), P(1, 1), P(5, 5), P(6, 7)), false);
  assert.equal(cruzam(P(0, 0), P(10, 0), P(10, 0), P(10, 10)), false);
});

/**
 * Grafo à mão: raiz, dois domínios com 6 tópicos cada. Seis, e não menos,
 * porque a pureza olha os 5 vizinhos mais próximos — com poucos tópicos o
 * outro domínio entraria na vizinhança por falta de opção.
 */
function grafoMao(posDom, posTopicos, arestasExtras = []) {
  const nodes = [{ id: 0, parent: null, depth: 0, x: 0, y: 0, vx: 0, vy: 0 }];
  posDom.forEach(([x, y], d) => nodes.push({ id: nodes.length, parent: 0, depth: 1, x, y, vx: 0, vy: 0 }));
  posTopicos.forEach((lista, d) => lista.forEach(([x, y]) =>
    nodes.push({ id: nodes.length, parent: 1 + d, depth: 2, x, y, vx: 0, vy: 0 })));
  const links = nodes.filter((n) => n.parent !== null).map((n) => ({ a: nodes[n.parent], b: n }));
  for (const [a, b] of arestasExtras) links.push({ a: nodes[a], b: nodes[b] });
  return { nodes, links };
}

const leque = (cx, lado) => Array.from({ length: 6 }, (_, i) => [cx + lado * 100, -250 + i * 100]);

test('medir: dois continentes limpos dão pureza 1, zero colados, zero cruzamentos', () => {
  const g = grafoMao([[-300, 0], [300, 0]], [leque(-300, -1), leque(300, 1)]);
  const m = medir(g);
  assert.equal(m.pureza, 1);
  assert.equal(m.perto, 0);
  assert.equal(m.cruzamentos, 0);
  assert.equal(m.raio, Math.hypot(400, 250));
});

test('medir: pureza mede continentes, não lados — trocar de lado em bloco continua puro', () => {
  const trocados = medir(grafoMao([[-300, 0], [300, 0]], [leque(300, 1), leque(-300, -1)]));
  assert.ok(trocados.pureza > 0.7, `em bloco, os tópicos continuam juntos: ${trocados.pureza}`);
  assert.ok(trocados.cruzamentos >= 1, 'mas as arestas domínio→tópico se cruzam no meio');
});

test('medir: tópicos intercalados derrubam a pureza; colados contam', () => {
  // mesma coluna, domínios alternando nó a nó: nenhum continente
  const col = Array.from({ length: 12 }, (_, i) => [0, -330 + i * 60]);
  const a = col.filter((_, i) => i % 2 === 0), b = col.filter((_, i) => i % 2 === 1);
  b[0] = [a[0][0], a[0][1] + LIMIAR_PERTO / 2];
  const m = medir(grafoMao([[-300, 0], [300, 0]], [a, b]));
  assert.ok(m.pureza < 0.6, `pureza ${m.pureza}`);
  assert.ok(m.perto >= 1);
});

test('pontuar: nota em [0, 100], e pesos somam 1', () => {
  const soma = Object.values(PESOS).reduce((s, x) => s + x, 0);
  assert.ok(Math.abs(soma - 1) < 1e-12);
  const perfeito = pontuar({ n: 77, arestas: 100, cruzamentos: 0, perto: 0, pureza: 1, velocidade: 0, raio: 500 });
  assert.ok(Math.abs(perfeito.aptidao - 100) < 1e-9);
  const pessimo = pontuar({ n: 77, arestas: 100, cruzamentos: 1000, perto: 500, pureza: 0, velocidade: 9, raio: 3000 });
  assert.ok(pessimo.aptidao >= 0 && pessimo.aptidao < 5);
});

test('pontuar: a faixa de raio cresce com √n para grafos maiores', () => {
  const pequeno = pontuar({ n: 77, arestas: 100, cruzamentos: 0, perto: 0, pureza: 1, velocidade: 0, raio: 900 });
  const grande = pontuar({ n: 308, arestas: 400, cruzamentos: 0, perto: 0, pureza: 1, velocidade: 0, raio: 900 });
  assert.ok(pequeno.partes.tela < 0.5);
  assert.equal(grande.partes.tela, 1);
});

test('avaliar é determinístico e traz margem de erro', async () => {
  const { tree, cross } = await readVault(fileURLToPath(new URL('../vault', import.meta.url)));
  const a = avaliar(tree, cross, PARAMS_MANUAIS, [1, 2], 600);
  const b = avaliar(tree, cross, PARAMS_MANUAIS, [1, 2], 600);
  assert.equal(a.aptidao, b.aptidao);
  assert.ok(a.erro > 0);
  assert.equal(a.porSemente.length, 2);
});

test('grafo sintético: tamanho e proporções parecidos com o real, sem aresta repetida', () => {
  const s = gerarCaderno({ dominios: 4, rng: mulberry32(77) });
  assert.ok(s.nNos > 100 && s.nNos < 200, `nós ${s.nNos}`);
  assert.equal(s.tree.children.length, 4);
  const chaves = new Set(s.cross.map((p) => p.slice().sort().join('|')));
  assert.equal(chaves.size, s.cross.length);
  assert.ok(Math.abs(s.cross.length / s.nNos - 0.75) < 0.02);
});
