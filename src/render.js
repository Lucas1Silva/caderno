/**
 * Desenho. Camadas, nesta ordem: fundo, poeira, pulso de origem, arestas,
 * nós, rótulos. Nada aqui altera o estado da física — só lê.
 *
 * O destaque funciona por "constelação": quando há um nó ativo (hover ou
 * selecionado), acendem ele, sua subárvore inteira, o caminho até a raiz e
 * os vizinhos por aresta cruzada. Todo o resto escurece. É isso que permite
 * deixar o grafo inteiro aberto sem virar sopa de letrinhas.
 */

import { rgba } from './palette.js';

const TAU = Math.PI * 2;
const APAGADO = 0.13;            // opacidade de quem está fora da constelação

/**
 * Quanto do corpo de um TÓPICO aparece, por status. Hubs (raiz, domínios,
 * sub-áreas) não passam por aqui: são estrutura, não estudo.
 *
 * `vazio` fica oco — anel e halo inteiros, miolo quase transparente. A
 * ideia é o grafo continuar bonito com tudo vazio, mas deixar evidente,
 * de relance, onde ainda não há nada. Se ficar apagado demais para o seu
 * gosto, é o primeiro número desta tabela.
 */
export const PESO_STATUS = {
  vazio: 0.30,
  rascunho: 0.62,
  estudado: 0.95,
  reproduzido: 0.95
};
const ZOOM_ROTULO = 1.1;         // acima disso, rótulo de tópico aparece sempre
const PULSO_MS = 2400;

export function createRenderer(vp, graph, P, { reduced = false } = {}) {
  const { nodes, links, constellation } = graph;
  let stars = [];

  /** Poeira de fundo: vive em coordenadas de tela porque é cenário, não conteúdo. */
  function rebuild() {
    stars = [];
    const count = Math.round((vp.W * vp.H) / 5200);
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * vp.W,
        y: Math.random() * vp.H,
        r: Math.random() * 1.1 + 0.25,
        a: Math.random() * 0.7 + 0.2,
        tw: Math.random() * TAU,
        sp: Math.random() * 0.0009 + 0.0003
      });
    }
  }

  function draw(elapsed, { hovered = null, selected = null } = {}) {
    const { ctx, W, H, cam } = vp;
    const ativo = hovered || selected;
    const aceso = ativo ? constellation[ativo.id] : null;
    const dentro = (id) => !aceso || aceso.has(id);

    // ---- fundo ----
    const bg = ctx.createRadialGradient(W / 2, H * 0.46, 0, W / 2, H * 0.46, Math.max(W, H) * 0.78);
    bg.addColorStop(0, P.void2);
    bg.addColorStop(1, P.void);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // ---- poeira ----
    for (const s of stars) {
      const tw = reduced ? 1 : 0.55 + 0.45 * Math.sin(elapsed * s.sp + s.tw);
      ctx.fillStyle = rgba(P.star, s.a * P.starA * tw);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }

    // ---- pulso de origem: único momento coreografado, no carregamento ----
    // p é fixado em 0..1 de propósito: ctx.arc lança IndexSizeError com raio
    // negativo, e a exceção derrubaria o resto do frame junto.
    if (elapsed < PULSO_MS && !reduced) {
      const p = Math.min(1, Math.max(0, elapsed / PULSO_MS));
      ctx.strokeStyle = rgba(P.core, (1 - p) * 0.22);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(vp.toScreenX(0), vp.toScreenY(0), p * Math.max(W, H) * 0.62, 0, TAU);
      ctx.stroke();
    }

    // ---- arestas ----
    ctx.lineCap = 'round';
    for (const l of links) {
      const { a, b } = l;
      const alive = Math.min(a.alive, b.alive);
      if (alive <= 0) continue;

      const lit = aceso && dentro(a.id) && dentro(b.id);
      const dim = aceso && !lit;
      const alpha = P.edgeA * alive * (lit ? 3.0 : dim ? 0.18 : 1);

      // a aresta acesa toma a cor do nó mais raso dos dois
      const raso = a.depth <= b.depth ? a : b;
      ctx.strokeStyle = lit
        ? P.node(raso.h, raso.shade, Math.min(alpha, 0.9))
        : rgba(P.edge, Math.min(alpha, 0.9));
      ctx.lineWidth = (lit ? 1.5 : 0.85) * Math.max(cam.k, 0.5);

      ctx.beginPath();
      ctx.moveTo(vp.toScreenX(a.x), vp.toScreenY(a.y));
      ctx.lineTo(vp.toScreenX(b.x), vp.toScreenY(b.y));
      ctx.stroke();
    }

    // ---- nós ----
    for (const n of nodes) {
      if (n.alive <= 0) continue;
      const sx = vp.toScreenX(n.x);
      const sy = vp.toScreenY(n.y);
      const pulse = reduced ? 1 : 1 + 0.055 * Math.sin(elapsed * 0.0011 * n.drift + n.phase);
      const r = Math.max(0, n.radius * cam.k * n.alive * pulse);
      if (r < 0.4) continue;

      const fade = dentro(n.id) ? 1 : APAGADO;
      const eh = selected && selected.id === n.id;
      const topico = n.children.length === 0 && n.depth > 0;
      const peso = topico ? (PESO_STATUS[n.status] ?? PESO_STATUS.vazio) : 1;

      // o halo cai menos que o miolo: um nó vazio ainda brilha, só não é sólido
      const halo = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 5.2);
      halo.addColorStop(0, P.node(n.h, n.shade, P.glowA * n.alive * fade * (eh ? 1.8 : 1) * (0.55 + 0.45 * peso)));
      halo.addColorStop(1, P.node(n.h, n.shade, 0));
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(sx, sy, r * 5.2, 0, TAU); ctx.fill();

      ctx.fillStyle = P.node(n.h, n.shade, (n.depth >= 3 ? 0.88 : 0.95) * peso * n.alive * fade);
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();

      // o anel do nó vazio leva a cor do domínio: é ele que desenha o contorno
      ctx.strokeStyle = topico && n.status === 'vazio'
        ? P.node(n.h, n.shade, 0.75 * n.alive * fade)
        : rgba(P.ink, 0.45 * n.alive * fade);
      ctx.lineWidth = Math.max(0.6, r * 0.11);
      ctx.beginPath(); ctx.arc(sx, sy, r + 1.6, 0, TAU); ctx.stroke();

      // reproduzido do zero ganha um segundo anel — é a marca que mais importa
      if (topico && n.status === 'reproduzido') {
        ctx.strokeStyle = P.node(n.h, n.shade, 0.6 * n.alive * fade);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(sx, sy, r + 5.2, 0, TAU); ctx.stroke();
      }

      // A raiz emana anéis lentos — "onde acontece o boom". Dois anéis
      // defasados em meio ciclo, para nunca haver um instante sem nenhum.
      // Alpha baixo de propósito: é batimento de fundo, não efeito.
      if (n.depth === 0 && !reduced) {
        for (let k = 0; k < 2; k++) {
          const f = ((elapsed / 7000) + k * 0.5) % 1;
          ctx.strokeStyle = rgba(P.core, (1 - f) * 0.13 * n.alive);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(0, r + f * r * 8), 0, TAU);
          ctx.stroke();
        }
      }

      // anel do nó selecionado: marca onde o painel está lendo
      if (eh) {
        ctx.strokeStyle = P.node(n.h, n.shade, 0.75);
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(sx, sy, r + 9, 0, TAU); ctx.stroke();
      }
    }

    // ---- rótulos ----
    // Raiz, domínios e sub-áreas sempre visíveis; tópicos só na constelação
    // acesa ou com zoom. Com todos visíveis ao mesmo tempo a tela satura.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const n of nodes) {
      if (n.alive < 0.5) continue;
      const perto = dentro(n.id);
      const estrutural = n.depth <= 2;
      if (!(estrutural || (aceso && perto) || cam.k > ZOOM_ROTULO)) continue;

      const sx = vp.toScreenX(n.x);
      const sy = vp.toScreenY(n.y);
      if (sx < -170 || sx > W + 170 || sy < -60 || sy > H + 60) continue;

      const size = n.depth === 0 ? 18 : n.depth === 1 ? 15 : n.depth === 2 ? 12.5 : 11;
      ctx.font = `${n.depth <= 1 ? 400 : 300} ${size * Math.max(cam.k, 0.8)}px "Newsreader", Georgia, serif`;

      const forte = estrutural || (ativo && ativo.id === n.id);
      const alpha = (perto ? (forte ? 0.95 : 0.68) : APAGADO) * n.alive;
      ctx.fillStyle = rgba(forte ? P.ink : P.inkdim, alpha);
      ctx.fillText(n.label, sx, sy + n.radius * cam.k + 10);
    }
  }

  return { draw, rebuild };
}
