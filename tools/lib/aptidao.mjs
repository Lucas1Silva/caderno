/**
 * Função de aptidão: quão bom é um universo.
 *
 * Roda a física sem navegador até assentar e mede cinco coisas no layout
 * final. Cada medida vira uma nota de 0 a 1, e a aptidão é a média
 * ponderada delas, de 0 a 100.
 *
 * AVISO HONESTO: os pesos e as escalas abaixo são opinião, não verdade.
 * Quem decidiu que cruzar arestas pesa mais que ficar compacto fui eu. O
 * algoritmo genético não elimina a subjetividade de escolher parâmetros —
 * ele a muda de lugar, dos parâmetros para esta função.
 */

import { buildGraph } from '../../src/graph.js';
import { createSimulation } from '../../src/physics.js';
import { mulberry32 } from '../../src/params.js';

/** Pesos da nota final. Somam 1. */
export const PESOS = {
  cruzamentos: 0.30,   // arestas que se cruzam: o que mais embaralha a leitura
  pureza: 0.25,        // domínios formam continentes, sem se misturar
  sobreposicao: 0.20,  // nós colados demais para distinguir
  tela: 0.15,          // cabe no enquadramento inicial sem sobrar vazio
  estabilidade: 0.10   // assenta em vez de tremer
};

/**
 * Escalas: o valor bruto em que a nota de cada critério cai para ~37% (1/e).
 *
 * Calibradas contra 30 genomas aleatórios e os parâmetros manuais. A
 * primeira versão tinha três escalas erradas, e a calibração é o que
 * mostrou: cruzamentos 4× apertada (todo mundo tirava ~0 no critério de
 * maior peso), sobreposição com limiar de 40 (nenhum genoma chegava lá, a
 * nota era sempre 1) e pureza usada crua (variava de 0,87 a 0,96 e valia
 * dois pontos). Uma nota que não discrimina não guia a evolução.
 */
export const ESCALAS = {
  cruzamentosPorAresta: 1.0,   // aleatórios caem entre 0,7 e 2,3 por aresta
  pertoPorNo: 0.10,            // manual: 8 pares colados em 77 nós → 0,35
  impureza: 0.10,              // 1 − pureza; aleatórios entre 0,04 e 0,13
  velocidade: 0.08,            // px/frame residuais
  foraDaFaixa: 150             // unidades além da faixa de raio aceitável
};

/**
 * Distância abaixo da qual dois nós contam como colados (unidades do mundo).
 * 65 é onde a contagem separa genomas: de 0 a 42 pares nos aleatórios.
 */
export const LIMIAR_PERTO = 65;

/**
 * Faixa de raio aceitável para o grafo real (77 nós). O enquadramento
 * inicial (viewport.fit) mostra ~725 unidades do centro até a borda menor;
 * 650 deixa espaço para os rótulos. Abaixo de 400 sobra tela vazia.
 * Para grafos maiores a faixa cresce com √n, porque a área cresce com n.
 */
export const FAIXA_RAIO = { min: 400, max: 650, nReferencia: 77 };

/** Passos de simulação por avaliação: 40 s simulados a 60 fps. */
export const PASSOS = 2400;

/* ------------------------------------------------------------------ */
/*  geometria                                                          */
/* ------------------------------------------------------------------ */

/** Os segmentos p1p2 e p3p4 se cruzam propriamente (sem tocar só na ponta)? */
export function cruzam(p1, p2, p3, p4) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/* ------------------------------------------------------------------ */
/*  medidas brutas                                                     */
/* ------------------------------------------------------------------ */

/**
 * Mede o layout atual de um grafo já simulado.
 * @returns {{ n, arestas, cruzamentos, perto, pureza, velocidade, raio }}
 */
export function medir(graph) {
  const { nodes, links } = graph;
  const n = nodes.length;

  // cruzamentos: pares de arestas que não compartilham ponta
  let cruzamentos = 0;
  for (let i = 0; i < links.length; i++) {
    const A = links[i];
    for (let j = i + 1; j < links.length; j++) {
      const B = links[j];
      if (A.a === B.a || A.a === B.b || A.b === B.a || A.b === B.b) continue;
      if (cruzam(A.a, A.b, B.a, B.b)) cruzamentos++;
    }
  }

  // sobreposição: pares mais próximos que o limiar
  let perto = 0;
  const L2 = LIMIAR_PERTO * LIMIAR_PERTO;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
      if (dx * dx + dy * dy < L2) perto++;
    }
  }

  // pureza: entre os 5 vizinhos espaciais mais próximos de cada nó abaixo de
  // um domínio, que fração pertence ao MESMO domínio? 1 = continentes limpos.
  const dominio = nodes.map((nd) => {
    let p = nd;
    while (p.depth > 1 && p.parent !== null) p = nodes[p.parent];
    return p.depth >= 1 ? p.id : null;
  });
  const candidatos = nodes.filter((nd) => nd.depth >= 1);
  const K = 5;
  let somaPureza = 0, contados = 0;
  const nDominios = new Set(dominio.filter((d) => d !== null)).size;
  if (nDominios > 1) {
    for (const a of nodes) {
      if (a.depth < 2) continue;
      const viz = candidatos
        .filter((b) => b !== a)
        .map((b) => ({ b, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 }))
        .sort((x, y) => x.d - y.d)
        .slice(0, K);
      somaPureza += viz.filter(({ b }) => dominio[b.id] === dominio[a.id]).length / viz.length;
      contados++;
    }
  }
  const pureza = contados ? somaPureza / contados : 1;

  let velocidade = 0, raio = 0;
  for (const nd of nodes) {
    velocidade = Math.max(velocidade, Math.hypot(nd.vx, nd.vy));
    raio = Math.max(raio, Math.hypot(nd.x, nd.y));
  }

  return { n, arestas: links.length, cruzamentos, perto, pureza, velocidade, raio };
}

/* ------------------------------------------------------------------ */
/*  nota                                                               */
/* ------------------------------------------------------------------ */

/** Transforma medidas brutas em notas de 0 a 1 e na aptidão de 0 a 100. */
export function pontuar(m) {
  const escalaRaio = Math.sqrt(m.n / FAIXA_RAIO.nReferencia);
  const min = FAIXA_RAIO.min * escalaRaio, max = FAIXA_RAIO.max * escalaRaio;
  const fora = m.raio > max ? m.raio - max : m.raio < min ? min - m.raio : 0;

  const partes = {
    cruzamentos: Math.exp(-(m.cruzamentos / m.arestas) / ESCALAS.cruzamentosPorAresta),
    pureza: Math.exp(-(1 - m.pureza) / ESCALAS.impureza),
    sobreposicao: Math.exp(-(m.perto / m.n) / ESCALAS.pertoPorNo),
    tela: Math.exp(-fora / ESCALAS.foraDaFaixa),
    estabilidade: Math.exp(-m.velocidade / ESCALAS.velocidade)
  };
  let total = 0;
  for (const [k, w] of Object.entries(PESOS)) total += w * partes[k];
  return { aptidao: 100 * total, partes };
}

/* ------------------------------------------------------------------ */
/*  avaliação completa                                                 */
/* ------------------------------------------------------------------ */

/** Simula um universo com uma semente e devolve o grafo assentado. */
export function simular(tree, cross, params, semente, passos = PASSOS) {
  // Nascimento no ritmo normal (reduced: false no grafo), mas física SEM a
  // respiração permanente (reduced: true na simulação): a oscilação é
  // decoração, e com ela ligada nenhum layout jamais "assenta" para medir.
  const g = buildGraph(tree, cross, { params, rng: mulberry32(semente) });
  const sim = createSimulation(g, { reduced: true, params, rng: mulberry32(semente ^ 0x9e3779b9) });
  let t = 0;
  for (let i = 0; i < passos; i++) {
    t += 16.6667;
    sim.step(1, t);
  }
  return g;
}

/**
 * Aptidão média de um conjunto de parâmetros em várias sementes.
 * Média, e não melhor caso: o universo nasce de posições aleatórias toda
 * vez que a página abre, então o que importa é o comportamento típico.
 */
export function avaliar(tree, cross, params, sementes, passos = PASSOS) {
  const porSemente = sementes.map((s) => {
    const m = medir(simular(tree, cross, params, s, passos));
    return { semente: s, medidas: m, ...pontuar(m) };
  });
  const media = (f) => porSemente.reduce((acc, r) => acc + f(r), 0) / porSemente.length;
  // Erro padrão da média: o mesmo genoma varia uns 5-6 pontos só trocando a
  // semente. Sem esta margem, uma diferença de 2 pontos pareceria resultado.
  const m = media((r) => r.aptidao);
  const n = porSemente.length;
  const dp = Math.sqrt(porSemente.reduce((acc, r) => acc + (r.aptidao - m) ** 2, 0) / Math.max(1, n - 1));
  const partes = {};
  for (const k of Object.keys(PESOS)) partes[k] = media((r) => r.partes[k]);
  const medidas = {};
  for (const k of Object.keys(porSemente[0].medidas)) medidas[k] = media((r) => r.medidas[k]);
  return { aptidao: m, erro: n > 1 ? dp / Math.sqrt(n) : 0, partes, medidas, porSemente };
}
