/**
 * Relatório da evolução: resultado.json → uma página HTML autocontida.
 *
 *   node tools/relatorio.mjs                 regera evolucao/relatorio.html
 *   node tools/relatorio.mjs --fragmento X   versão sem <html>/<head>, para publicar
 *
 * Chamado automaticamente por tools/evolve.mjs ao terminar. Os gráficos são
 * desenhados no navegador a partir dos dados embutidos: sem biblioteca, sem
 * rede além da fonte, abre com dois cliques.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ESTILO = `
:root{
  --bg:#F4F0E7; --ink:#1B1626; --ink2:#4A4356; --muted:#6B6274;
  --line:rgba(27,22,38,.14); --grid:rgba(27,22,38,.08); --soft:rgba(27,22,38,.045);
  --evo:#A0600A; --evo-wash:rgba(160,96,10,.13); --man:#1F6FB2;
  --core:#7A4A12; --node-s:64%; --node-l:38; --node-r:15;
  --edge:rgba(27,22,38,.20); --edge-x:rgba(27,22,38,.09);
  --tip:#FFFDF8; --tip-line:rgba(27,22,38,.16);
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    color-scheme:dark;
    --bg:#120C22; --ink:#EDE6DA; --ink2:#C9C0D6; --muted:#8F86A3;
    --line:rgba(237,230,218,.14); --grid:rgba(237,230,218,.07); --soft:rgba(237,230,218,.04);
    --evo:#BD8428; --evo-wash:rgba(189,132,40,.16); --man:#4F92D8;
    --core:#F4E2B6; --node-s:58%; --node-l:66; --node-r:21;
    --edge:rgba(237,230,218,.20); --edge-x:rgba(237,230,218,.08);
    --tip:#1E1633; --tip-line:rgba(237,230,218,.16);
  }
}
:root[data-theme="dark"]{
  color-scheme:dark;
  --bg:#120C22; --ink:#EDE6DA; --ink2:#C9C0D6; --muted:#8F86A3;
  --line:rgba(237,230,218,.14); --grid:rgba(237,230,218,.07); --soft:rgba(237,230,218,.04);
  --evo:#BD8428; --evo-wash:rgba(189,132,40,.16); --man:#4F92D8;
  --core:#F4E2B6; --node-s:58%; --node-l:66; --node-r:21;
  --edge:rgba(237,230,218,.20); --edge-x:rgba(237,230,218,.08);
  --tip:#1E1633; --tip-line:rgba(237,230,218,.16);
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:300 17px/1.62 "Newsreader",Georgia,"Times New Roman",serif;-webkit-font-smoothing:antialiased}
.pagina{max-width:860px;margin:0 auto;padding-inline:clamp(16px,4vw,40px);padding-block:clamp(28px,6vw,64px) 72px}
.num,.mono{font-family:"IBM Plex Mono",ui-monospace,"Cascadia Code",Consolas,monospace;font-variant-numeric:tabular-nums}
h1{font-weight:400;font-size:clamp(2.1rem,5.4vw,3.2rem);line-height:1.04;letter-spacing:-.02em;margin:.25em 0 0;text-wrap:balance}
h2{font-weight:400;font-size:clamp(1.35rem,2.8vw,1.7rem);line-height:1.15;letter-spacing:-.01em;margin:0;text-wrap:balance}
.olho{font:400 .72rem/1.4 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);margin:0}
.tese{font-size:clamp(1.08rem,2.2vw,1.24rem);line-height:1.55;color:var(--ink2);max-width:62ch;margin:1.1em 0 0}
.tese strong{font-weight:500;color:var(--ink)}
.meta{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:1.4em;font-size:.78rem;color:var(--muted)}
section{margin-top:clamp(52px,8vw,84px);display:grid;gap:14px}
section > p{margin:0;max-width:65ch;color:var(--ink2)}
.nota{font-size:.88rem;color:var(--muted);max-width:65ch;margin:0}
.grafico{position:relative}
.grafico svg{display:block;width:100%;height:auto;overflow:visible}
.grafico svg:focus-visible{outline:2px solid var(--evo);outline-offset:4px;border-radius:4px}
svg text{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11.5px;fill:var(--muted)}
svg .rot{fill:var(--ink2);font-size:12px}
svg .rot-forte{fill:var(--ink);font-size:12.5px;font-weight:500}
.legenda{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:.8rem;color:var(--ink2)}
.legenda span{display:inline-flex;align-items:center;gap:7px}
.chave{display:inline-block;width:18px;height:0;border-top:2px solid}
.chave.tracejada{border-top-style:dashed}
.chave.faixa{height:9px;border:0;border-radius:2px;background:var(--evo-wash)}
.chave.ponto{width:9px;height:9px;border:0;border-radius:50%}
.dica{position:absolute;pointer-events:none;z-index:2;min-width:150px;
  background:var(--tip);border:1px solid var(--tip-line);border-radius:6px;
  padding:8px 10px;font-size:.78rem;line-height:1.45;box-shadow:0 6px 24px rgba(0,0,0,.12)}
.dica .t{color:var(--muted);font-size:.72rem;letter-spacing:.04em;margin-bottom:3px}
.dica .l{display:flex;align-items:center;gap:8px;justify-content:space-between}
.dica .l b{font-weight:500;color:var(--ink)}
.dica .l span{display:inline-flex;align-items:center;gap:6px;color:var(--muted)}
.par{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.fileira{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
@media (max-width:620px){.par{grid-template-columns:1fr}.fileira{grid-template-columns:1fr 1fr}}
figure{margin:0;display:grid;gap:6px}
figure svg{display:block;width:100%;height:auto;aspect-ratio:1;background:var(--soft);border-radius:8px}
figcaption{font-size:.8rem;color:var(--muted);display:flex;justify-content:space-between;gap:8px}
figcaption b{font-weight:500;color:var(--ink)}
.tabela{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.86rem}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
th{font:400 .7rem/1.3 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
td.r,th.r{text-align:right}
tr.escolhido td{background:var(--evo-wash)}
.cod{font-size:.72rem;color:var(--muted);display:block}
.faixa-gene{position:relative;height:14px;min-width:120px}
.faixa-gene::before{content:"";position:absolute;left:0;right:0;top:6px;height:2px;background:var(--grid);border-radius:1px}
.faixa-gene i{position:absolute;top:2px;width:10px;height:10px;margin-left:-5px;border-radius:50%;box-shadow:0 0 0 2px var(--bg)}
details{border-top:1px solid var(--line);padding-top:10px}
summary{cursor:pointer;font-size:.86rem;color:var(--ink2)}
summary:focus-visible{outline:2px solid var(--evo);outline-offset:3px}
details .tabela{margin-top:10px;max-height:320px;overflow:auto}
.ressalvas{display:grid;gap:14px;margin:0;padding:0;list-style:none}
.ressalvas li{display:grid;gap:3px;max-width:65ch}
.ressalvas b{font-weight:500}
.ressalvas span{color:var(--ink2)}
`;

const SCRIPT = String.raw`
(() => {
const D = JSON.parse(document.getElementById('dados').textContent);
const css = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, pai) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (pai) pai.appendChild(e);
  return e;
};
const txt = (pai, x, y, s, attrs = {}) => { const t = el('text', { x, y, ...attrs }, pai); t.textContent = s; return t; };
const f1 = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const sinal = (v) => (v >= 0 ? '+' : '−') + f1(Math.abs(v));

function dica(caixa) {
  const d = document.createElement('div');
  d.className = 'dica'; d.hidden = true; caixa.appendChild(d);
  return {
    mostrar(titulo, linhas, x, y) {
      d.replaceChildren();
      const t = document.createElement('div'); t.className = 't'; t.textContent = titulo; d.appendChild(t);
      for (const [rot, val, cor, tracejado] of linhas) {
        const l = document.createElement('div'); l.className = 'l';
        const s = document.createElement('span');
        if (cor) { const k = document.createElement('i'); k.className = 'chave' + (tracejado ? ' tracejada' : ''); k.style.borderColor = cor; s.appendChild(k); }
        s.appendChild(document.createTextNode(rot));
        const b = document.createElement('b'); b.className = 'num'; b.textContent = val;
        l.append(s, b); d.appendChild(l);
      }
      d.hidden = false;
      const w = caixa.clientWidth, dw = d.offsetWidth;
      d.style.left = Math.max(0, Math.min(w - dw, x + 14)) + 'px';
      d.style.top = Math.max(0, y - d.offsetHeight - 10) + 'px';
    },
    esconder() { d.hidden = true; }
  };
}

/* ---------- 1. treino, teste, grafo maior: halteres com margem de erro ---------- */
function halteres() {
  const caixa = document.getElementById('g-halteres');
  const linhas = [
    ['treino', 'sementes que a evolução viu', D.treino],
    ['teste', '10 sementes nunca vistas', D.teste],
    ['grafo maior', D.sintetico.nos + ' nós, sintético', D.sintetico]
  ];
  const W = 720, H = 44 + linhas.length * 64, E = 170, Dm = 60;
  const todos = linhas.flatMap(([, , r]) => [r.manual.aptidao - r.manual.erro, r.evoluido.aptidao + r.evoluido.erro, r.manual.aptidao + r.manual.erro, r.evoluido.aptidao - r.evoluido.erro]);
  const lo = Math.floor((Math.min(...todos) - 3) / 10) * 10, hi = Math.ceil((Math.max(...todos) + 3) / 10) * 10;
  const x = (v) => E + ((v - lo) / (hi - lo)) * (W - E - Dm);
  const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', tabindex: '0',
    'aria-label': 'Aptidão média do manual e do evoluído em treino, teste e grafo maior' }, caixa);
  for (let v = lo; v <= hi; v += 10) {
    el('line', { x1: x(v), x2: x(v), y1: 20, y2: H - 22, stroke: css('--grid'), 'stroke-width': 1 }, svg);
    txt(svg, x(v), H - 6, v, { 'text-anchor': 'middle' });
  }
  const tip = dica(caixa);
  linhas.forEach(([nome, sub, r], i) => {
    const y = 48 + i * 64;
    txt(svg, 0, y - 3, nome, { class: 'rot-forte' });
    txt(svg, 0, y + 14, sub);
    const m = r.manual, e = r.evoluido;
    el('line', { x1: x(m.aptidao), x2: x(e.aptidao), y1: y, y2: y, stroke: css('--line'), 'stroke-width': 6, 'stroke-linecap': 'round' }, svg);
    for (const [s, cor] of [[m, css('--man')], [e, css('--evo')]]) {
      el('line', { x1: x(s.aptidao - s.erro), x2: x(s.aptidao + s.erro), y1: y, y2: y, stroke: cor, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: .55 }, svg);
      el('circle', { cx: x(s.aptidao), cy: y, r: 6, fill: cor, stroke: css('--bg'), 'stroke-width': 2 }, svg);
    }
    const d = e.aptidao - m.aptidao;
    txt(svg, W, y + 4, sinal(d), { 'text-anchor': 'end', class: 'rot-forte' });
    const alvo = el('rect', { x: E - 10, y: y - 20, width: W - E - Dm + 20, height: 40, fill: 'transparent' }, svg);
    const mostrar = (ev) => {
      const b = caixa.getBoundingClientRect();
      const px = ev && ev.clientX ? ev.clientX - b.left : (x(e.aptidao) / W) * caixa.clientWidth;
      tip.mostrar(nome, [
        ['evoluído', f1(e.aptidao) + ' ± ' + f1(e.erro), css('--evo')],
        ['manual', f1(m.aptidao) + ' ± ' + f1(m.erro), css('--man')],
        ['diferença', sinal(d)]
      ], px, (y / H) * caixa.clientHeight);
    };
    alvo.addEventListener('pointermove', mostrar);
    alvo.addEventListener('pointerleave', () => tip.esconder());
  });
  svg.addEventListener('focus', () => {
    const r = D.teste;
    tip.mostrar('teste', [['evoluído', f1(r.evoluido.aptidao) + ' ± ' + f1(r.evoluido.erro), css('--evo')], ['manual', f1(r.manual.aptidao) + ' ± ' + f1(r.manual.erro), css('--man')]], caixa.clientWidth * .6, caixa.clientHeight * .55);
  });
  svg.addEventListener('blur', () => tip.esconder());
}

/* ---------- 2. retratos do universo ---------- */
const MAIOR_RAIO = (() => {
  let m = 0;
  for (const r of [D.retratos.manual, D.retratos.vencedor, ...D.retratos.geracoes])
    for (const [x, y] of r.nos) m = Math.max(m, Math.hypot(x, y));
  return m * 1.1;
})();

function retrato(caixa, r, { rotulos = false } = {}) {
  const R = MAIOR_RAIO, T = 2 * R;
  const svg = el('svg', { viewBox: [-R, -R, T, T].join(' '), role: 'img', 'aria-label': 'Layout assentado do grafo' }, caixa);
  const S = css('--node-s'), L = parseFloat(css('--node-l')), LR = parseFloat(css('--node-r'));
  const cor = (h, sh) => h === null ? css('--core') : 'hsl(' + h + ',' + S + ',' + (L + (sh - .5) * LR).toFixed(1) + '%)';
  const k = T / 300;
  for (const [a, b, cruz] of r.arestas) {
    const A = r.nos[a], B = r.nos[b];
    el('line', { x1: A[0], y1: A[1], x2: B[0], y2: B[1], stroke: cruz ? css('--edge-x') : css('--edge'), 'stroke-width': (cruz ? .8 : 1) * k }, svg);
  }
  const raio = [5.2, 3.8, 2.4, 1.6, 1.4];
  const ordem = r.nos.map((n, i) => i).sort((i, j) => r.nos[j][2] - r.nos[i][2]);
  for (const i of ordem) {
    const [x, y, d, h, sh] = r.nos[i];
    el('circle', { cx: x, cy: y, r: raio[Math.min(d, 4)] * k, fill: cor(h, sh) }, svg);
  }
  if (rotulos) {
    r.nos.forEach(([x, y, d], i) => {
      if (d !== 1 || !r.rotulos[i]) return;
      txt(svg, x, y + 11 * k, r.rotulos[i], { 'text-anchor': 'middle', class: 'rot', style: 'font-size:' + (10.5 * k).toFixed(1) + 'px' });
    });
  }
}

function retratos() {
  retrato(document.getElementById('r-manual'), D.retratos.manual, { rotulos: true });
  retrato(document.getElementById('r-vencedor'), D.retratos.vencedor, { rotulos: true });
  D.retratos.geracoes.forEach((g, i) => retrato(document.getElementById('r-g' + i), g));
}

/* ---------- 3. curva de aptidão ---------- */
function curva() {
  const caixa = document.getElementById('g-curva');
  const H0 = D.historico, n = H0.length;
  const W = 720, H = 300, E = 34, Dm = 96, T = 14, B = 30;
  const base = D.treino.manual.aptidao;
  const vals = H0.flatMap((h) => [h.pior, h.melhor]).concat(base);
  const lo = Math.max(0, Math.floor((Math.min(...vals) - 2) / 10) * 10), hi = Math.ceil((Math.max(...vals) + 2) / 10) * 10;
  const x = (g) => E + (g / Math.max(1, n - 1)) * (W - E - Dm);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', tabindex: '0',
    'aria-label': 'Aptidão do melhor indivíduo e da média da população por geração' }, caixa);
  for (let v = lo; v <= hi; v += 10) {
    el('line', { x1: E, x2: W - Dm, y1: y(v), y2: y(v), stroke: css('--grid'), 'stroke-width': 1 }, svg);
    txt(svg, E - 8, y(v) + 4, v, { 'text-anchor': 'end' });
  }
  const passo = n > 20 ? 5 : 2;
  for (let g = 0; g < n; g += passo) txt(svg, x(g), H - 8, g, { 'text-anchor': 'middle' });
  txt(svg, W - Dm, H - 8, 'geração', { 'text-anchor': 'end' });

  const faixa = H0.map((h, g) => x(g) + ',' + y(h.melhor)).join(' ') + ' ' + H0.slice().reverse().map((h, i) => x(n - 1 - i) + ',' + y(h.pior)).join(' ');
  el('polygon', { points: faixa, fill: css('--evo-wash') }, svg);
  el('line', { x1: E, x2: W - Dm, y1: y(base), y2: y(base), stroke: css('--man'), 'stroke-width': 2, 'stroke-dasharray': '6 5' }, svg);
  const linha = (k, extra) => el('polyline', { points: H0.map((h, g) => x(g) + ',' + y(h[k])).join(' '), fill: 'none', stroke: css('--evo'), 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...extra }, svg);
  linha('media', { 'stroke-dasharray': '2 5', opacity: .9 });
  linha('melhor');
  const ult = H0[n - 1];
  el('circle', { cx: x(n - 1), cy: y(ult.melhor), r: 4.5, fill: css('--evo'), stroke: css('--bg'), 'stroke-width': 2 }, svg);
  const rotulos = [[ult.melhor, 'melhor ' + f1(ult.melhor)], [ult.media, 'média ' + f1(ult.media)], [base, 'manual ' + f1(base)]]
    .sort((a, b) => b[0] - a[0]);
  let ultimoY = -Infinity;
  for (const [v, s] of rotulos) {
    const yy = Math.max(y(v) + 4, ultimoY + 15);
    txt(svg, W - Dm + 10, yy, s, { class: 'rot' });
    ultimoY = yy;
  }

  const tip = dica(caixa);
  const cruz = el('line', { y1: T, y2: H - B, stroke: css('--muted'), 'stroke-width': 1, opacity: 0 }, svg);
  const ponto = el('circle', { r: 4.5, fill: css('--evo'), stroke: css('--bg'), 'stroke-width': 2, opacity: 0 }, svg);
  let atual = n - 1;
  const mostrar = (g) => {
    atual = g;
    const h = H0[g];
    cruz.setAttribute('x1', x(g)); cruz.setAttribute('x2', x(g)); cruz.setAttribute('opacity', .5);
    ponto.setAttribute('cx', x(g)); ponto.setAttribute('cy', y(h.melhor)); ponto.setAttribute('opacity', 1);
    tip.mostrar('geração ' + g, [
      ['melhor', f1(h.melhor), css('--evo')],
      ['média', f1(h.media), css('--evo'), true],
      ['pior', f1(h.pior)],
      ['manual', f1(base), css('--man'), true],
      ['diversidade', h.diversidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })]
    ], (x(g) / W) * caixa.clientWidth, (y(h.melhor) / H) * caixa.clientHeight);
  };
  const esconder = () => { cruz.setAttribute('opacity', 0); ponto.setAttribute('opacity', 0); tip.esconder(); };
  const alvo = el('rect', { x: E, y: T, width: W - E - Dm, height: H - T - B, fill: 'transparent' }, svg);
  alvo.addEventListener('pointermove', (ev) => {
    const b = svg.getBoundingClientRect();
    const vx = ((ev.clientX - b.left) / b.width) * W;
    mostrar(Math.max(0, Math.min(n - 1, Math.round(((vx - E) / (W - E - Dm)) * (n - 1)))));
  });
  alvo.addEventListener('pointerleave', esconder);
  svg.addEventListener('focus', () => mostrar(atual));
  svg.addEventListener('blur', esconder);
  svg.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowLeft') { mostrar(Math.max(0, atual - 1)); ev.preventDefault(); }
    if (ev.key === 'ArrowRight') { mostrar(Math.min(n - 1, atual + 1)); ev.preventDefault(); }
  });
}

/* ---------- 4. critérios, lado a lado ---------- */
function criterios() {
  const caixa = document.getElementById('g-criterios');
  const NOMES = { cruzamentos: 'poucos cruzamentos', pureza: 'continentes limpos', sobreposicao: 'nada colado', tela: 'cabe na tela', estabilidade: 'assenta' };
  const ks = Object.keys(D.aptidao.pesos);
  const W = 720, linha = 46, H = 16 + ks.length * linha + 22, E = 190, Dm = 56;
  const x = (v) => E + v * (W - E - Dm);
  const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', tabindex: '0',
    'aria-label': 'Nota de cada critério, de 0 a 1, para manual e evoluído nas sementes de teste' }, caixa);
  for (const v of [0, .25, .5, .75, 1]) {
    el('line', { x1: x(v), x2: x(v), y1: 8, y2: H - 22, stroke: css('--grid'), 'stroke-width': 1 }, svg);
    txt(svg, x(v), H - 6, v.toLocaleString('pt-BR'), { 'text-anchor': 'middle' });
  }
  const tip = dica(caixa);
  ks.forEach((k, i) => {
    const y0 = 14 + i * linha;
    txt(svg, 0, y0 + 14, NOMES[k] || k, { class: 'rot-forte' });
    txt(svg, 0, y0 + 30, 'peso ' + Math.round(D.aptidao.pesos[k] * 100) + '%');
    const m = D.teste.manual.partes[k], e = D.teste.evoluido.partes[k];
    [[m, css('--man'), 0], [e, css('--evo'), 1]].forEach(([v, cor, j]) => {
      const yy = y0 + 6 + j * 16;
      const w = Math.max(2, x(v) - x(0));
      el('path', { d: 'M' + x(0) + ',' + yy + 'h' + (w - 4) + 'a4,4 0 0 1 4,4v4a4,4 0 0 1 -4,4h-' + (w - 4) + 'z', fill: cor }, svg);
      txt(svg, x(v) + 6, yy + 10, v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    });
    const alvo = el('rect', { x: 0, y: y0, width: W, height: linha - 4, fill: 'transparent' }, svg);
    alvo.addEventListener('pointermove', (ev) => {
      const b = caixa.getBoundingClientRect();
      tip.mostrar(NOMES[k], [['evoluído', e.toFixed(2).replace('.', ','), css('--evo')], ['manual', m.toFixed(2).replace('.', ','), css('--man')]], ev.clientX - b.left, ((y0 + 10) / H) * caixa.clientHeight);
    });
    alvo.addEventListener('pointerleave', () => tip.esconder());
  });
}

halteres(); retratos(); curva(); criterios();
})();
`;

/* ------------------------------------------------------------------ */
/*  conteúdo estático, montado em Node                                 */
/* ------------------------------------------------------------------ */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f1 = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const sinal = (v) => (v >= 0 ? '+' : '−') + f1(Math.abs(v));

const NOME_GENE = {
  REPULSION: 'repulsão entre nós',
  SPRING: 'rigidez das molas',
  GRAVITY: 'gravidade ao centro',
  DAMPING: 'velocidade retida por frame',
  MOLA_DOMINIO: 'mola raiz → domínio',
  MOLA_SUBAREA: 'mola domínio → sub-área',
  MOLA_TOPICO: 'mola sub-área → tópico',
  MOLA_CRUZADA: 'mola das arestas cruzadas'
};

function valor(v) {
  if (Math.abs(v) >= 100) return Math.round(v).toLocaleString('pt-BR');
  if (Math.abs(v) >= 1) return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return v.toLocaleString('pt-BR', { maximumSignificantDigits: 3 });
}

export function montar(r, { fragmento = false } = {}) {
  const dTeste = r.teste.evoluido.aptidao - r.teste.manual.aptidao;
  const dTreino = r.treino.evoluido.aptidao - r.treino.manual.aptidao;
  const dSint = r.sintetico.evoluido.aptidao - r.sintetico.manual.aptidao;
  const somaErro = Math.hypot(r.teste.evoluido.erro, r.teste.manual.erro);
  const claro = dTeste > 2 * somaErro;
  const erroTreino = Math.hypot(r.treino.evoluido.erro, r.treino.manual.erro);

  // O texto acompanha o que ESTA rodada mostrou. Uma frase fixa como "a
  // vantagem encolhe fora do treino" seria mentira na rodada em que não
  // encolhe — e foi exatamente o que aconteceu na primeira versão.
  const encolhe = dTeste < dTreino - Math.hypot(erroTreino, somaErro);
  const tituloResultado = !claro
    ? 'Fora do treino, a diferença fica dentro da margem de erro'
    : encolhe
      ? 'A vantagem encolhe fora do treino, e não some'
      : 'A vantagem se mantém fora do treino';
  const textoResultado = `No treino o evoluído ganha por <span class="num">${sinal(dTreino)}</span>. ` +
    (encolhe
      ? `Em sementes novas a vantagem cai para <span class="num">${sinal(dTeste)}</span>: parte do ganho do treino era sorte nas posições iniciais que a evolução viu.`
      : `Em ${r.configuracao.sementesTeste.length} sementes novas fica em <span class="num">${sinal(dTeste)}</span>, dentro da margem de erro do treino: a escolha pela validação filtrou a sorte.`) +
    ` Num grafo sintético com ${r.sintetico.nos} nós, que nenhuma etapa usou, a diferença é <span class="num">${sinal(dSint)}</span>` +
    (dSint > 2 * Math.hypot(r.sintetico.evoluido.erro, r.sintetico.manual.erro)
      ? ' — os parâmetros não decoraram o grafo de 77 nós.'
      : ', dentro da margem de erro: com o grafo maior, a vantagem não se sustenta.');

  const fins = r.finalistas || [];
  const idxEscolhido = fins.findIndex((f) => f.escolhido);
  const porTreino = fins.slice().sort((a, b) => b.treino - a.treino);
  const posTreinoEscolhido = porTreino.findIndex((f) => f.escolhido) + 1;
  const primeiro = porTreino[0];
  const textoFinalistas = fins.length ? (
    `Os ${fins.length} melhores da última geração, arredondados e reavaliados em ${r.configuracao.sementesValidacao.length} sementes de validação. ` +
    (primeiro && !primeiro.escolhido
      ? `O 1º do treino (<span class="num">${f1(primeiro.treino)}</span>) fica com <span class="num">${f1(primeiro.validacao)}</span> na validação; o escolhido era o ${posTreinoEscolhido}º do treino. `
      : 'O 1º do treino também foi o melhor na validação. ') +
    `Quem chega ao topo do treino chega em parte por sorte nas sementes que viu — por isso a escolha é feita na validação, não no treino.`
  ) : '';
  const G = r.retratos.geracoes;
  const vFinal = r.historico.at(-1);

  const dados = JSON.stringify({
    treino: r.treino, teste: r.teste, sintetico: r.sintetico,
    historico: r.historico, retratos: r.retratos, aptidao: r.aptidao
  }).replace(/</g, '\\u003c');

  // Gene encostado na borda: o ótimo pode estar FORA da faixa que eu defini.
  const naBorda = (g) => g.posicaoEvoluida < 0.04 || g.posicaoEvoluida > 0.96;
  const bordas = r.genes.filter(naBorda);
  const genes = r.genes.map((g) => `
      <tr>
        <td>${esc(NOME_GENE[g.nome] || g.nome)}<span class="cod mono">${esc(g.nome)}${g.log ? ' · escala log' : ''}${naBorda(g) ? ' · na borda' : ''}</span></td>
        <td class="r num">${valor(g.min)} – ${valor(g.max)}</td>
        <td class="r num">${valor(g.manual)}</td>
        <td class="r num">${valor(g.evoluido)}</td>
        <td><div class="faixa-gene" aria-label="posição na faixa: manual ${Math.round(g.posicaoManual * 100)}%, evoluído ${Math.round(g.posicaoEvoluida * 100)}%">
          <i style="left:${(g.posicaoManual * 100).toFixed(1)}%;background:var(--man)"></i>
          <i style="left:${(g.posicaoEvoluida * 100).toFixed(1)}%;background:var(--evo)"></i>
        </div></td>
      </tr>`).join('');

  // na ordem do treino: é assim que se vê o ranking do treino não se repetir na validação
  const finalistas = (r.finalistas || []).slice().sort((a, b) => b.treino - a.treino).map((f, i) => `
      <tr${f.escolhido ? ' class="escolhido"' : ''}>
        <td class="num">${i + 1}º${f.escolhido ? ' · escolhido' : ''}</td>
        <td class="r num">${f1(f.treino)}</td>
        <td class="r num">${f1(f.validacao)} ± ${f1(f.erro)}</td>
        <td class="r num">${sinal(f.validacao - f.treino)}</td>
      </tr>`).join('');

  const historico = r.historico.map((h) => `
      <tr><td class="num">${h.geracao}</td><td class="r num">${f1(h.melhor)}</td><td class="r num">${f1(h.media)}</td><td class="r num">${f1(h.pior)}</td><td class="r num">${h.diversidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td></tr>`).join('');

  const pesos = Object.entries(r.aptidao.pesos).map(([k, v]) => `${Math.round(v * 100)}% ${k}`).join(' · ');

  const corpo = `
<main class="pagina">
  <p class="olho">caderno · física · ${esc(r.data)}</p>
  <h1>Evolução do Caderno</h1>
  <p class="tese">Um algoritmo genético ajustou os oito parâmetros da física do grafo. Em ${r.configuracao.sementesTeste.length} posições iniciais que ele nunca viu, o universo evoluído tira
    <strong class="num">${f1(r.teste.evoluido.aptidao)}</strong> contra <strong class="num">${f1(r.teste.manual.aptidao)}</strong> dos parâmetros que eu tinha ajustado à mão${claro ? '' : ' — uma diferença dentro da margem de erro'}.</p>
  <div class="meta mono">
    <span>${r.configuracao.populacao} indivíduos × ${r.configuracao.geracoes} gerações</span>
    <span>${r.genes.length} genes</span>
    <span>${r.configuracao.passos / 60} s simulados por universo</span>
    <span>${r.segundos} s de evolução</span>
  </div>

  <section aria-labelledby="t-resultado">
    <p class="olho">o resultado</p>
    <h2 id="t-resultado">${tituloResultado}</h2>
    <p>${textoResultado}</p>
    <div class="legenda">
      <span><i class="chave ponto" style="background:var(--evo)"></i>evoluído</span>
      <span><i class="chave ponto" style="background:var(--man)"></i>manual</span>
      <span class="mono" style="color:var(--muted)">traço fino = ± erro padrão da média</span>
    </div>
    <div class="grafico" id="g-halteres"></div>
  </section>

  <section aria-labelledby="t-retratos">
    <p class="olho">mesma semente, física diferente</p>
    <h2 id="t-retratos">Os dois universos, assentados</h2>
    <p>Os dois nasceram das mesmas posições (semente ${r.retratos.semente}) e rodaram ${r.configuracao.passos / 60} segundos simulados. Mesma escala nos dois.</p>
    <div class="par">
      <figure><div id="r-manual"></div><figcaption><span>ajustado à mão</span><b class="num">${f1(r.teste.manual.aptidao)}</b></figcaption></figure>
      <figure><div id="r-vencedor"></div><figcaption><span>evoluído</span><b class="num">${f1(r.teste.evoluido.aptidao)}</b></figcaption></figure>
    </div>
  </section>

  <section aria-labelledby="t-curva">
    <p class="olho">a evolução</p>
    <h2 id="t-curva">Geração a geração</h2>
    <p>O melhor indivíduo nunca piora — os dois melhores de cada geração passam intactos. A média sobe à medida que a população converge: a diversidade caiu de <span class="num">${r.historico[0].diversidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</span> para <span class="num">${vFinal.diversidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</span>.</p>
    <div class="legenda">
      <span><i class="chave" style="border-color:var(--evo)"></i>melhor</span>
      <span><i class="chave tracejada" style="border-color:var(--evo)"></i>média da população</span>
      <span><i class="chave faixa"></i>do pior ao melhor</span>
      <span><i class="chave tracejada" style="border-color:var(--man)"></i>manual</span>
    </div>
    <div class="grafico" id="g-curva"></div>
    <div class="fileira">
      ${G.map((g, i) => `<figure><div id="r-g${i}"></div><figcaption><span>geração ${g.geracao}</span><b class="num">${f1(g.aptidao)}</b></figcaption></figure>`).join('')}
    </div>
    <p class="nota">O campeão de treino em cada marco, na semente ${r.retratos.semente}. As notas são de treino.</p>
    <details>
      <summary>Ver os números por geração</summary>
      <div class="tabela"><table>
        <thead><tr><th>geração</th><th class="r">melhor</th><th class="r">média</th><th class="r">pior</th><th class="r">diversidade</th></tr></thead>
        <tbody>${historico}</tbody>
      </table></div>
    </details>
  </section>

  <section aria-labelledby="t-criterios">
    <p class="olho">de onde vem a nota</p>
    <h2 id="t-criterios">Os cinco critérios</h2>
    <p>Cada critério vale de 0 a 1; a aptidão é a média ponderada, de 0 a 100. Notas nas sementes de teste.</p>
    <div class="legenda">
      <span><i class="chave faixa" style="background:var(--evo)"></i>evoluído</span>
      <span><i class="chave faixa" style="background:var(--man)"></i>manual</span>
    </div>
    <div class="grafico" id="g-criterios"></div>
  </section>

  <section aria-labelledby="t-genes">
    <p class="olho">o genoma</p>
    <h2 id="t-genes">O que mudou</h2>
    ${bordas.length ? `<p>${bordas.length === 1 ? 'Um gene encostou' : `${bordas.length} genes encostaram`} na borda da faixa permitida (${bordas.map((g) => esc(NOME_GENE[g.nome] || g.nome)).join(', ')}). A evolução queria ir além do limite que eu defini: o próximo experimento é alargar ${bordas.length === 1 ? 'essa faixa' : 'essas faixas'}.</p>` : ''}
    <div class="tabela"><table>
      <thead><tr><th>gene</th><th class="r">faixa</th><th class="r">manual</th><th class="r">evoluído</th><th>posição na faixa</th></tr></thead>
      <tbody>${genes}</tbody>
    </table></div>
  </section>

  ${finalistas ? `<section aria-labelledby="t-finalistas">
    <p class="olho">maldição do vencedor</p>
    <h2 id="t-finalistas">O melhor do treino não é o melhor de fato</h2>
    <p>${textoFinalistas}</p>
    <div class="tabela"><table>
      <thead><tr><th>posição no treino</th><th class="r">treino</th><th class="r">validação</th><th class="r">diferença</th></tr></thead>
      <tbody>${finalistas}</tbody>
    </table></div>
    <p class="nota">Treino é a nota que o finalista teve durante a evolução; validação é a do valor arredondado, em sementes novas. Os dois efeitos — sorte na semente e caos do arredondamento — entram na diferença.</p>
  </section>` : ''}

  <section aria-labelledby="t-ressalvas">
    <p class="olho">como ler isto</p>
    <h2 id="t-ressalvas">Ressalvas</h2>
    <ul class="ressalvas">
      <li><b>A nota é opinião.</b><span>Os pesos (${esc(pesos)}) e as escalas foram escolhidos por mim. O algoritmo otimiza a minha definição de “bonito”, e não uma definição objetiva.</span></li>
      <li><b>A nota é ruidosa.</b><span>O mesmo genoma varia uns 6 pontos só trocando a posição inicial dos nós. Por isso toda comparação aqui usa média de várias sementes, com erro padrão.</span></li>
      <li><b>A física é caótica.</b><span>Mudar um parâmetro na sexta casa decimal muda o layout final. Os finalistas foram arredondados antes da validação, para que o valor gravado seja exatamente o que foi testado.</span></li>
      <li><b>Treino, validação e teste.</b><span>Sementes ${esc(r.configuracao.sementesTreino.join(', '))} guiaram a evolução; ${r.configuracao.sementesValidacao.length} outras escolheram o finalista; as ${r.configuracao.sementesTeste.length} de teste e o grafo sintético não participaram de nenhuma escolha.</span></li>
    </ul>
  </section>
</main>
<script type="application/json" id="dados">${dados}</script>
<script>${SCRIPT}</script>`;

  const cabeca = `<title>Evolução do Caderno</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,300&display=swap" rel="stylesheet">
<style>${ESTILO}</style>`;

  if (fragmento) return `${cabeca}\n${corpo}\n`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
${cabeca}
</head>
<body>
${corpo}
</body>
</html>
`;
}

export async function gerarRelatorio(resultado, caminho, opts) {
  await writeFile(caminho, montar(resultado, opts), 'utf8');
}

// ---- execução direta ----
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = JSON.parse(await readFile(join(RAIZ, 'evolucao/resultado.json'), 'utf8'));
  const i = process.argv.indexOf('--fragmento');
  if (i !== -1) {
    const alvo = resolve(process.argv[i + 1] || join(RAIZ, 'evolucao/relatorio.fragmento.html'));
    await gerarRelatorio(r, alvo, { fragmento: true });
    console.log(alvo);
  } else {
    await gerarRelatorio(r, join(RAIZ, 'evolucao/relatorio.html'));
    console.log('evolucao/relatorio.html');
  }
}
