import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, PARAMS_MANUAIS } from '../src/params.js';
import {
  GENES, decodificar, codificar, cruzar, mutar, torneio, diversidade, evoluir, aleatorio
} from '../tools/lib/genetico.mjs';

test('mulberry32: mesma semente, mesma sequência; sempre em [0, 1)', () => {
  const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
  const sa = Array.from({ length: 1000 }, a);
  assert.deepEqual(sa.slice(0, 5), Array.from({ length: 5 }, b));
  assert.notEqual(sa[0], c());
  assert.ok(sa.every((x) => x >= 0 && x < 1));
  const media = sa.reduce((s, x) => s + x, 0) / sa.length;
  assert.ok(Math.abs(media - 0.5) < 0.05, `média ${media}`);
});

test('decodificar respeita as faixas, inclusive em escala log', () => {
  const lo = decodificar(GENES.map(() => 0));
  const hi = decodificar(GENES.map(() => 1));
  const meio = decodificar(GENES.map(() => 0.5));
  for (const g of GENES) {
    assert.ok(Math.abs(lo[g.nome] - g.min) < 1e-9 * g.max);
    assert.ok(Math.abs(hi[g.nome] - g.max) < 1e-9 * g.max);
    const esperado = g.log ? Math.sqrt(g.min * g.max) : (g.min + g.max) / 2;
    assert.ok(Math.abs(meio[g.nome] - esperado) / esperado < 1e-9, `${g.nome}: meio ${meio[g.nome]} ≠ ${esperado}`);
  }
});

test('codificar é o inverso de decodificar; valores manuais cabem nas faixas', () => {
  const genoma = [0.1, 0.9, 0.33, 0.5, 0.0, 1.0, 0.72, 0.25];
  const volta = codificar(decodificar(genoma));
  genoma.forEach((x, i) => assert.ok(Math.abs(x - volta[i]) < 1e-9));
  const manual = codificar(PARAMS_MANUAIS);
  assert.ok(manual.every((x) => x > 0 && x < 1), 'manual dentro das faixas, não na borda');
});

test('genes fora de [0, 1] são limitados, não extrapolados', () => {
  const p = decodificar(GENES.map(() => 5));
  for (const g of GENES) assert.ok(Math.abs(p[g.nome] - g.max) < 1e-9 * g.max);
});

test('cruzamento fica perto dos pais e sempre dentro de [0, 1]', () => {
  const rng = mulberry32(1);
  for (let i = 0; i < 200; i++) {
    const a = aleatorio(rng), b = aleatorio(rng);
    const f = cruzar(a, b, rng, 0.25);
    f.forEach((x, k) => {
      const lo = Math.min(a[k], b[k]), hi = Math.max(a[k], b[k]), folga = (hi - lo) * 0.25;
      assert.ok(x >= Math.max(0, lo - folga) - 1e-12 && x <= Math.min(1, hi + folga) + 1e-12);
    });
  }
});

test('mutação com taxa 0 não muda nada; com taxa 1 muda tudo, sem sair de [0, 1]', () => {
  const rng = mulberry32(2);
  const g = aleatorio(rng);
  assert.deepEqual(mutar(g, rng, { taxa: 0 }), g);
  const m = mutar(g, rng, { taxa: 1, desvio: 0.5 });
  assert.ok(m.every((x, i) => x !== g[i] || x === 0 || x === 1));
  assert.ok(m.every((x) => x >= 0 && x <= 1));
});

test('torneio devolve o melhor dos sorteados', () => {
  const pop = [{ aptidao: 1 }, { aptidao: 5 }, { aptidao: 3 }];
  assert.equal(torneio(pop, mulberry32(3), 50).aptidao, 5);
});

test('diversidade: zero em população idêntica, positiva em população variada', () => {
  assert.equal(diversidade([[0.2, 0.4], [0.2, 0.4]]), 0);
  assert.ok(diversidade([[0, 0], [1, 1]]) > 0.4);
});

test('evoluir acha o máximo de uma função conhecida, e o melhor nunca piora', () => {
  const alvo = GENES.map((_, i) => (i + 1) / (GENES.length + 1));
  const f = (g) => ({ aptidao: -g.reduce((s, x, i) => s + (x - alvo[i]) ** 2, 0) });
  const { melhor, populacao, historico } = evoluir(f, { populacao: 20, geracoes: 40, rng: mulberry32(7) });
  for (let i = 1; i < historico.length; i++) {
    assert.ok(historico[i].melhor >= historico[i - 1].melhor, `geração ${i} piorou (elitismo quebrado)`);
  }
  assert.ok(melhor.aptidao > -0.01, `ficou longe do ótimo: ${melhor.aptidao}`);
  assert.ok(historico.at(-1).diversidade < historico[0].diversidade, 'a população converge');
  assert.equal(populacao[0], melhor);
});

test('evoluir é reprodutível: mesma semente, mesma evolução', () => {
  const f = (g) => ({ aptidao: g[0] - g[1] });
  const a = evoluir(f, { populacao: 8, geracoes: 5, rng: mulberry32(9) });
  const b = evoluir(f, { populacao: 8, geracoes: 5, rng: mulberry32(9) });
  assert.deepEqual(a.melhor.genoma, b.melhor.genoma);
});
