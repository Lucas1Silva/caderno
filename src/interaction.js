/**
 * Ponteiro e teclado.
 *
 * Pointer Events em vez de mouse+touch separados: um caminho só cobre mouse,
 * toque e caneta. O pinch precisa rastrear dois ponteiros, daí o Map.
 *
 * Clique e arrasto compartilham o mesmo gesto, então há um limiar: se o
 * ponteiro andou menos de ARRASTE_MIN pixels entre o down e o up, foi
 * clique — e clique seleciona. Sem isso, arrastar um nó abriria o painel
 * sem parar.
 */

import { ZOOM_MIN, ZOOM_MAX } from './viewport.js';

const ARRASTE_MIN = 5;

export function attachInteraction(vp, graph, { onHover, onSelect } = {}) {
  const canvas = vp.canvas;
  const { nodes } = graph;

  const pointers = new Map();
  let dragNode = null;
  let panning = false;
  let panStart = null;
  let pinchStart = null;
  let hovered = null;
  let downAt = null;
  let andou = 0;

  function pick(sx, sy) {
    let best = null;
    let bestD = Infinity;
    for (const n of nodes) {
      if (n.alive < 0.3) continue;
      const d = Math.hypot(sx - vp.toScreenX(n.x), sy - vp.toScreenY(n.y));
      // alvo mínimo generoso: os tópicos são bolinhas de ~5px
      const alvo = Math.max(n.radius * vp.cam.k, 6) + 13;
      if (d < alvo && d < bestD) { best = n; bestD = d; }
    }
    return best;
  }

  function setHover(n) {
    if (n === hovered) return;
    hovered = n;
    onHover?.(n);
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    downAt = { x: e.offsetX, y: e.offsetY };
    andou = 0;

    if (pointers.size === 2) {
      const [p, q] = [...pointers.values()];
      pinchStart = { d: Math.hypot(p.x - q.x, p.y - q.y), k: vp.cam.k };
      dragNode = null;
      panning = false;
      return;
    }

    const n = pick(e.offsetX, e.offsetY);
    if (n) {
      dragNode = n;
      n.pinned = true;
      setHover(n);
    } else {
      panning = true;
      panStart = { sx: e.offsetX, sy: e.offsetY, cx: vp.cam.x, cy: vp.cam.y };
      canvas.classList.add('grabbing');
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (downAt) andou = Math.max(andou, Math.hypot(e.offsetX - downAt.x, e.offsetY - downAt.y));

    if (pinchStart && pointers.size === 2) {
      const [p, q] = [...pointers.values()];
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      vp.cam.k = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinchStart.k * (d / pinchStart.d)));
      return;
    }

    if (dragNode) {
      const w = vp.toWorld(e.offsetX, e.offsetY);
      dragNode.x = w.x;
      dragNode.y = w.y;
      return;
    }

    if (panning && panStart) {
      vp.cam.x = panStart.cx - (e.offsetX - panStart.sx) / vp.cam.k;
      vp.cam.y = panStart.cy - (e.offsetY - panStart.sy) / vp.cam.k;
      return;
    }

    const n = pick(e.offsetX, e.offsetY);
    setHover(n);
    canvas.style.cursor = n ? 'pointer' : 'grab';
  });

  function release(e, { clicavel = true } = {}) {
    const eraNo = dragNode;
    const foiClique = clicavel && andou < ARRASTE_MIN;

    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;

    // O nó selecionado continua fixo; quem for solto sem seleção volta à física.
    if (dragNode) { dragNode.pinned = false; dragNode = null; }
    panning = false;
    panStart = null;
    downAt = null;
    canvas.classList.remove('grabbing');

    if (foiClique) onSelect?.(eraNo || null);
  }

  canvas.addEventListener('pointerup', (e) => release(e));
  canvas.addEventListener('pointercancel', (e) => release(e, { clicavel: false }));
  canvas.addEventListener('pointerleave', (e) => {
    release(e, { clicavel: false });
    setHover(null);
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    vp.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0014));
  }, { passive: false });

  canvas.addEventListener('keydown', (e) => {
    const s = 60 / vp.cam.k;
    switch (e.key) {
      case 'ArrowLeft':  vp.cam.x -= s; break;
      case 'ArrowRight': vp.cam.x += s; break;
      case 'ArrowUp':    vp.cam.y -= s; break;
      case 'ArrowDown':  vp.cam.y += s; break;
      case '+': case '=': vp.cam.k = Math.min(ZOOM_MAX, vp.cam.k * 1.15); break;
      case '-': case '_': vp.cam.k = Math.max(ZOOM_MIN, vp.cam.k / 1.15); break;
      case '0': vp.fit(); break;
      default: return;
    }
    e.preventDefault();
  });

  return {
    get hovered() { return hovered; },
    clearHover() { setHover(null); }
  };
}
