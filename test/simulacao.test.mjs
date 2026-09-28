/**
 * Física e desenho, com o vault real.
 *
 * O canvas falso lança exatamente onde o Chrome lança (raio negativo em
 * arc). Foi assim que o bug do `elapsed` negativo apareceu na máquina do
 * Lucas e não aparecia aqui — este teste existe para ele não voltar.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readVault } from '../tools/lib/vault.mjs';
import { buildGraph } from '../src/graph.js';
import { createSimulation } from '../src/physics.js';
import { createRenderer } from '../src/render.js';
import { rgba } from '../src/palette.js';
import { mulberry32 } from '../src/params.js';

const { tree, cross } = await readVault(fileURLToPath(new URL('../vault', import.meta.url)));

// Semeado: antes, com posições iniciais de Math.random, o teste de
// convergência falhava de vez em quando — uma em algumas dezenas de rodadas.
function rodar(g, segundos, opts = {}) {
  const sim = createSimulation(g, { rng: mulberry32(99), ...opts });
  let t = 0;
  for (let i = 0; i < segundos * 60; i++) { t += 16.6667; sim.step(1, t); }
}

test('grafo: hierarquia, cor herdada e nenhum tópico órfão', () => {
  const g = buildGraph(tree, cross);
  assert.equal(g.nodes[0].h, null, 'a raiz não tem matiz');
  for (const n of g.nodes) {
    // sub-área (2) tem cor PRÓPRIA dentro do arco do domínio; tópico (3+) herda
    if (n.depth >= 3) assert.equal(n.h, g.nodes[n.parent].h, `${n.label} herda a cor da sub-área`);
    if (n.depth === 2) {
      const [a, b] = tree.children.find((d) => d.label === g.nodes[n.parent].label).hue;
      assert.ok(n.h >= a && n.h <= b, `${n.label} fica dentro do arco do domínio`);
    }
    if (n.depth > 0) assert.ok(g.neighbors[n.id].size > 0, `${n.label} tem ao menos uma aresta`);
  }
  assert.ok(g.bySlug.get('mcp'), 'bySlug resolve');
});

test('constelação de um domínio acende a subárvore inteira', () => {
  const g = buildGraph(tree, cross);
  const dom = g.nodes.find((n) => n.depth === 1);
  for (const id of g.descendants[dom.id]) assert.ok(g.constellation[dom.id].has(id));
});

test('física converge: raiz ancorada, sem NaN, sem sobreposição', () => {
  const g = buildGraph(tree, cross, { reduced: true, rng: mulberry32(1) });
  rodar(g, 90, { reduced: true });
  assert.equal(g.nodes.filter((n) => !Number.isFinite(n.x)).length, 0);
  assert.equal(g.core.x, 0);
  assert.equal(g.core.y, 0);
  const vmax = Math.max(...g.nodes.map((n) => Math.hypot(n.vx, n.vy)));
  assert.ok(vmax < 0.05, `velocidade residual ${vmax.toFixed(3)} — a simulação não assentou`);
  let min = Infinity;
  for (let i = 0; i < g.nodes.length; i++)
    for (let j = i + 1; j < g.nodes.length; j++)
      min = Math.min(min, Math.hypot(g.nodes[i].x - g.nodes[j].x, g.nodes[i].y - g.nodes[j].y));
  assert.ok(min > 30, `dois nós a ${min.toFixed(1)}px — sobreposição`);
});

test('com a respiração ligada o grafo continua vivo, mas não treme', () => {
  const g = buildGraph(tree, cross, { rng: mulberry32(2) });
  rodar(g, 60);
  const vmax = Math.max(...g.nodes.map((n) => Math.hypot(n.vx, n.vy)));
  assert.ok(vmax > 0.01 && vmax < 1.2, `velocidade ${vmax.toFixed(3)} fora da faixa viva`);
});

function canvasFalso() {
  let arcs = 0;
  const ctx = new Proxy({}, {
    get(_, k) {
      if (k === 'arc') return (x, y, r) => { if (!(r >= 0)) throw new Error(`IndexSizeError: raio ${r}`); arcs++; };
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set() { return true; }
  });
  const cam = { x: 0, y: 0, k: 0.6 };
  return {
    vp: { ctx, W: 1440, H: 900, cam, toScreenX: (x) => x * 0.6 + 720, toScreenY: (y) => y * 0.6 + 450 },
    arcs: () => arcs
  };
}

const paleta = {
  void: '#0A0713', void2: '#17102A', ink: '#EDE6DA', inkdim: '#8F86A3', edge: '#B6A9D6',
  core: '#F4E2B6', star: '#FFFFFF', edgeA: 0.18, starA: 0.55, glowA: 0.34,
  nodeS: 58, nodeL: 66, nodeLRange: 21,
  node(h, s, a) { return h == null ? rgba(this.core, a) : `hsla(${h},58%,${66 + (s - 0.5) * 21}%,${a})`; }
};

test('render sobrevive a elapsed negativo (o bug do primeiro frame)', () => {
  const g = buildGraph(tree, cross);
  const { vp } = canvasFalso();
  const r = createRenderer(vp, g, paleta);
  r.rebuild();
  for (const e of [-500, -56, -1, 0]) assert.doesNotThrow(() => r.draw(e, {}), `elapsed ${e}`);
});

test('render roda 60s com hover, seleção e todos os status sem lançar', () => {
  const g = buildGraph(tree, cross);
  const status = ['vazio', 'rascunho', 'estudado', 'reproduzido'];
  g.nodes.forEach((n, i) => { n.status = status[i % 4]; });
  const { vp, arcs } = canvasFalso();
  const r = createRenderer(vp, g, paleta);
  r.rebuild();
  const sim = createSimulation(g);
  const mcp = g.bySlug.get('mcp');
  const dom = g.nodes.find((n) => n.depth === 1);
  let t = 0;
  for (let i = 0; i < 3600; i++) {
    t += 16.6667;
    sim.step(1, t);
    r.draw(t, { hovered: i % 400 < 60 ? dom : null, selected: i % 900 < 300 ? mcp : null });
  }
  assert.ok(arcs() > 0);
});

test('syncCross: aresta nova entra e sai com a física rodando', () => {
  const g = buildGraph(tree, cross);
  rodar(g, 5);
  const mcp = g.bySlug.get('mcp');
  const api = g.bySlug.get('api');
  const antes = g.links.length;

  const r1 = g.syncCross([...cross, ['mcp', 'api']]);
  assert.deepEqual(r1, { adicionadas: 1, removidas: 0 });
  assert.equal(g.links.length, antes + 1);
  assert.ok(g.neighbors[mcp.id].has(api.id));
  assert.ok(g.constellation[mcp.id].has(api.id), 'o hover em MCP acende API');

  rodar(g, 5);   // a mola nova não pode desestabilizar
  assert.equal(g.nodes.filter((n) => !Number.isFinite(n.x)).length, 0);

  const r2 = g.syncCross(cross);
  assert.deepEqual(r2, { adicionadas: 0, removidas: 1 });
  assert.equal(g.links.length, antes);
  assert.ok(!g.neighbors[mcp.id].has(api.id));
  assert.ok(!g.constellation[mcp.id].has(api.id));
  // tirar uma cruzada não pode apagar o parentesco da constelação
  assert.ok(g.constellation[mcp.id].has(mcp.parent));
});

test('syncCross com a mesma lista não mexe em nada', () => {
  const g = buildGraph(tree, cross);
  assert.deepEqual(g.syncCross(cross), { adicionadas: 0, removidas: 0 });
});

/* ---- física evoluída ---- */

import { PARAMS_MANUAIS } from '../src/params.js';
import { PARAMS_EVOLUIDOS } from '../src/data/fisica.js';
import { GENES } from '../tools/lib/genetico.mjs';

const velocidadeMedia = (g) => g.nodes.reduce((s, n) => s + Math.hypot(n.vx, n.vy), 0) / g.nodes.length;

test('física evoluída: todo gene presente e dentro da faixa', { skip: !PARAMS_EVOLUIDOS }, () => {
  for (const gene of GENES) {
    const v = PARAMS_EVOLUIDOS[gene.nome];
    assert.ok(Number.isFinite(v), `${gene.nome} ausente`);
    assert.ok(v >= gene.min * 0.999 && v <= gene.max * 1.001, `${gene.nome} = ${v} fora de [${gene.min}, ${gene.max}]`);
  }
});

test('física evoluída respira como a manual, apesar do atrito menor', { skip: !PARAMS_EVOLUIDOS }, () => {
  // Sem a escala de respiração, o evoluído ficava 2,5× mais agitado (0,41
  // contra 0,17 de velocidade média): a nota não mede isso, a tela mostra.
  const medir = (params) => {
    const g = buildGraph(tree, cross, { params, rng: mulberry32(101) });
    const sim = createSimulation(g, { params, rng: mulberry32(108) });
    let t = 0;
    for (let i = 0; i < 60 * 60; i++) { t += 16.6667; sim.step(1, t); }
    return velocidadeMedia(g);
  };
  const manual = medir(PARAMS_MANUAIS), evoluido = medir(PARAMS_EVOLUIDOS);
  assert.ok(evoluido < manual * 1.5, `evoluído ${evoluido.toFixed(3)} contra manual ${manual.toFixed(3)}`);
  assert.ok(evoluido > manual * 0.5, 'mas continua vivo');
});

test('troca de física ao vivo: molas e forças mudam com o grafo andando', { skip: !PARAMS_EVOLUIDOS }, () => {
  const g = buildGraph(tree, cross, { params: PARAMS_EVOLUIDOS, rng: mulberry32(5) });
  const sim = createSimulation(g, { params: PARAMS_EVOLUIDOS, rng: mulberry32(6) });
  let t = 0;
  const andar = (seg) => { for (let i = 0; i < seg * 60; i++) { t += 16.6667; sim.step(1, t); } };
  andar(20);

  g.setMolas(PARAMS_MANUAIS);
  sim.setParams(PARAMS_MANUAIS);
  const referencia = buildGraph(tree, cross, { params: PARAMS_MANUAIS, rng: mulberry32(5) });
  g.links.forEach((l, i) => assert.equal(l.rest, referencia.links[i].rest));
  assert.equal(sim.params.DAMPING, PARAMS_MANUAIS.DAMPING);

  andar(30);
  assert.equal(g.nodes.filter((n) => !Number.isFinite(n.x)).length, 0);
  const raio = Math.max(...g.nodes.map((n) => Math.hypot(n.x, n.y)));
  assert.ok(raio > 400 && raio < 700, `raio ${raio.toFixed(0)} depois da troca`);
});

test('aresta entre irmãos nunca pede distância impossível', () => {
  // Irmãos presos ao mesmo pai por molas L ficam no máximo a 2L. Pedir mais
  // deixava o nó sob tensão permanente — e a respiração o fazia sacudir.
  for (const params of [PARAMS_MANUAIS, PARAMS_EVOLUIDOS].filter(Boolean)) {
    const g = buildGraph(tree, cross, { params, rng: mulberry32(1) });
    const molaDoPai = (n) => g.links.find((l) => !l.cruzada && l.b === n).rest;
    for (const l of g.links) {
      if (!l.cruzada || l.a.parent === null || l.a.parent !== l.b.parent) continue;
      assert.ok(l.rest < 2 * molaDoPai(l.a), `${l.a.label}–${l.b.label}: repouso ${l.rest} ≥ ${2 * molaDoPai(l.a)}`);
    }
  }
});

test('nenhum nó sacode: velocidade máxima baixa, com a respiração ligada', { skip: !PARAMS_EVOLUIDOS }, () => {
  // Regressão do Chunking a 2,74 unidades/frame nas sementes 101 e 104.
  for (const params of [PARAMS_MANUAIS, PARAMS_EVOLUIDOS]) {
    for (const semente of [101, 104]) {
      const g = buildGraph(tree, cross, { params, rng: mulberry32(semente) });
      const sim = createSimulation(g, { params, rng: mulberry32(semente + 7) });
      let t = 0, pico = 0;
      for (let i = 0; i < 60 * 60; i++) {
        t += 16.6667;
        sim.step(1, t);
        if (i >= 30 * 60) for (const n of g.nodes) pico = Math.max(pico, Math.hypot(n.vx, n.vy));
      }
      assert.ok(pico < 1, `semente ${semente}: pico de ${pico.toFixed(2)} unidades/frame`);
    }
  }
});

test('inserir: nó novo entra vivo, com parentesco, constelação, trilha e cor', () => {
  const g = buildGraph(tree, cross, { rng: mulberry32(3) });
  rodar(g, 10);
  const agentes = g.bySlug.get('agentes');
  const dominio = g.nodes[agentes.parent];
  const antes = { nos: g.nodes.length, arestas: g.links.length };

  const novo = g.inserir({ slug: 'planejamento', label: 'Planejamento', status: 'vazio' }, 'agentes', { elapsed: 10000 });
  assert.equal(g.nodes.length, antes.nos + 1);
  assert.equal(g.links.length, antes.arestas + 1);
  assert.equal(g.bySlug.get('planejamento'), novo);
  assert.equal(novo.depth, agentes.depth + 1);
  assert.equal(novo.h, agentes.h, 'herda a cor da sub-área');
  assert.equal(novo.alive, 0, 'nasce invisível e cresce, como na expansão');
  assert.ok(g.neighbors[agentes.id].has(novo.id));
  assert.ok(g.constellation[dominio.id].has(novo.id), 'o hover no domínio acende o nó novo');
  assert.ok(g.constellation[g.core.id].has(novo.id));
  assert.deepEqual(g.path[novo.id], [...g.path[agentes.id], agentes.label]);
  assert.equal(g.inserir({ slug: 'planejamento', label: 'Planejamento' }, 'agentes'), novo, 'inserir de novo não duplica');

  // a física absorve o nó: ele se afasta do pai e nada vira NaN
  const sim = createSimulation(g, { rng: mulberry32(4) });
  let t = 10000;
  for (let i = 0; i < 20 * 60; i++) { t += 16.6667; sim.step(1, t); }
  assert.equal(g.nodes.filter((n) => !Number.isFinite(n.x)).length, 0);
  assert.equal(novo.alive, 1);
  assert.ok(Math.hypot(novo.x - agentes.x, novo.y - agentes.y) > 30, 'saiu de cima do pai');
});

test('inserir domínio novo: retingir dá a ele o arco da árvore nova', () => {
  const g = buildGraph(tree, cross, { rng: mulberry32(3) });
  const arvore = { ...tree, children: [...tree.children, { label: 'Python', slug: 'python', hue: [110, 165], children: [] }] };
  const py = g.inserir({ slug: 'python', label: 'Python' }, 'caderno', { arvore });
  assert.equal(py.depth, 1);
  assert.equal(py.h, (110 + 165) / 2);
});
