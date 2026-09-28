/**
 * A paleta vive no CSS; o canvas só a lê.
 *
 * Duas famílias de cor convivem aqui:
 *
 *  1. Cores fixas (fundo, tinta, aresta, poeira) — hex nos tokens CSS.
 *  2. Cor dos nós — GERADA em HSL. O matiz vem dos dados (o arco do
 *     domínio); saturação e luminosidade vêm do CSS, por tema. É isso que
 *     faz um domínio novo não precisar de nenhuma linha de CSS.
 *
 * A leitura acontece no início e quando o tema muda, nunca por frame:
 * getComputedStyle é caro.
 */

const cache = new Map();

/** '#RRGGBB' (ou '#RGB') → rgba() com a opacidade pedida. */
export function rgba(hex, a) {
  let c = cache.get(hex);
  if (!c) {
    let h = String(hex).replace('#', '').trim();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    c = [
      parseInt(h.slice(0, 2), 16) || 0,
      parseInt(h.slice(2, 4), 16) || 0,
      parseInt(h.slice(4, 6), 16) || 0
    ];
    cache.set(hex, c);
  }
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

export function createPalette() {
  const P = {
    void: '#000', void2: '#000', ink: '#fff', inkdim: '#888',
    edge: '#888', core: '#fff', star: '#fff',
    edgeA: 0.2, starA: 0.4, glowA: 0.3,
    nodeS: 58, nodeL: 66, nodeLRange: 16
  };

  /**
   * Cor de um nó.
   * @param {number|null} h     matiz em graus, ou null para a raiz
   * @param {number} shade      0..1, posição dentro do arco do domínio
   * @param {number} a          opacidade
   */
  P.node = function node(h, shade, a) {
    if (h === null || h === undefined) return rgba(P.core, a);
    // a luminosidade varia ao longo do arco: sem isso as sub-áreas de um
    // mesmo domínio ficariam quase indistinguíveis
    const l = P.nodeL + (shade - 0.5) * P.nodeLRange;
    return `hsla(${h.toFixed(1)},${P.nodeS}%,${l.toFixed(1)}%,${a})`;
  };

  function read() {
    const s = getComputedStyle(document.documentElement);
    const g = (k) => s.getPropertyValue(k).trim();
    const num = (k, fb) => { const v = parseFloat(g(k)); return Number.isFinite(v) ? v : fb; };

    P.void = g('--c-void');
    P.void2 = g('--c-void2');
    P.ink = g('--c-ink');
    P.inkdim = g('--c-inkdim');
    P.edge = g('--c-edge');
    P.core = g('--c-core');
    P.star = g('--c-star');

    P.edgeA = num('--edge-a', 0.2);
    P.starA = num('--star-a', 0.4);
    P.glowA = num('--glow-a', 0.3);

    P.nodeS = num('--node-s', 58);
    P.nodeL = num('--node-l', 66);
    P.nodeLRange = num('--node-l-range', 16);

    cache.clear();
  }

  read();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', read);
  new MutationObserver(read).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });

  return P;
}
