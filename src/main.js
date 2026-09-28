import { CADERNO, CROSS, META } from './data/caderno.gen.js';
import { PARAMS_MANUAIS } from './params.js';
import { PARAMS_EVOLUIDOS, EVOLUCAO } from './data/fisica.js';
import { buildGraph } from './graph.js';
import { createPalette } from './palette.js';
import { createViewport } from './viewport.js';
import { createSimulation } from './physics.js';
import { createRenderer } from './render.js';
import { attachInteraction } from './interaction.js';
import { createPanel } from './panel.js';
import { createEditor } from './editor.js';
import { createCriador } from './criador.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('sky');
const roEl = document.getElementById('readout');
const roName = document.getElementById('ro-name');
const roRel = document.getElementById('ro-rel');
const hintEl = document.getElementById('hint');
const statsEl = document.getElementById('stats');

// Física: a evoluída por padrão, se existir. O botão no canto troca ao vivo
// entre ela e a ajustada à mão; `?fisica=manual` escolhe a manual na largada.
const pedeManual = new URLSearchParams(location.search).get('fisica') === 'manual';
let usaEvoluida = Boolean(PARAMS_EVOLUIDOS) && !pedeManual;
const FISICA = usaEvoluida ? PARAMS_EVOLUIDOS : PARAMS_MANUAIS;

const graph = buildGraph(CADERNO, CROSS, { reduced, params: FISICA });
const palette = createPalette();
const vp = createViewport(canvas);
const sim = createSimulation(graph, { reduced, params: FISICA });
const renderer = createRenderer(vp, graph, palette, { reduced });

// ---- enquadramento: largada fixa, depois ajustado ao tamanho real ----
let kAlvo = null;
let mexeu = false;          // a pessoa já deu zoom ou arrastou: a câmera é dela
let assentado = false;

function enquadrar({ agora = false } = {}) {
  if (mexeu) return;
  let r = 0;
  for (const n of graph.nodes) r = Math.max(r, Math.hypot(n.x, n.y));
  kAlvo = vp.kParaRaio(r);
  if (agora || reduced) { vp.cam.k = kAlvo; kAlvo = null; }
}
for (const ev of ['wheel', 'pointerdown', 'keydown']) {
  canvas.addEventListener(ev, () => { mexeu = true; kAlvo = null; }, { passive: true });
}
setTimeout(() => { assentado = true; enquadrar(); }, graph.lastBorn + 2500);

function layout() {
  vp.resize();
  vp.fit();
  renderer.rebuild();
  if (assentado) enquadrar({ agora: true });
}
layout();
addEventListener('resize', layout);

const fisicaEl = document.getElementById('fisica');
if (fisicaEl && PARAMS_EVOLUIDOS) {
  const rotulo = document.createElement('span');
  const botao = document.createElement('button');
  botao.type = 'button';
  const pintar = () => {
    rotulo.textContent = usaEvoluida
      ? `física evoluída em ${EVOLUCAO.geracoes} gerações · `
      : 'física ajustada à mão · ';
    botao.textContent = usaEvoluida ? 'trocar pela manual' : 'trocar pela evoluída';
  };
  botao.addEventListener('click', () => {
    usaEvoluida = !usaEvoluida;
    const p = usaEvoluida ? PARAMS_EVOLUIDOS : PARAMS_MANUAIS;
    graph.setMolas(p);
    sim.setParams(p);
    pintar();
    // o universo se reorganiza em alguns segundos; depois, reenquadra
    setTimeout(() => enquadrar(), 3500);
  });
  pintar();
  fisicaEl.append(rotulo, botao);
}

// O contador mede o que importa: quantos tópicos saíram de "vazio".
// Se o número de nós crescer e este não, o caderno virou brinquedo.
function atualizarStats(meta) {
  if (!statsEl || !meta) return;
  const s = meta.porStatus || {};
  const saiu = (s.rascunho || 0) + (s.estudado || 0) + (s.reproduzido || 0);
  statsEl.textContent = `${saiu} de ${meta.topicos} tópicos com estudo` +
    (s.reproduzido ? ` · ${s.reproduzido} reproduzido${s.reproduzido > 1 ? 's' : ''} do zero` : '');
}
atualizarStats(META);

// ---------------------------------------------------------------------
//  seleção, painel e endereço
// ---------------------------------------------------------------------

let selected = null;
let camGoal = null;

const editor = createEditor({
  onSalvo(node, resposta) {
    // a nota muda no lugar: texto, estado e arestas, sem recarregar a página
    if (resposta.nota) {
      node.html = resposta.nota.html;
      node.vazio = resposta.nota.vazio;
      node.status = resposta.nota.status;
    }
    if (resposta.cross) graph.syncCross(resposta.cross);
    atualizarStats(resposta.meta);
    panel.refresh();
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const avisos = resposta.avisos?.length ? ` · ${resposta.avisos.length} aviso no build` : '';
    panel.avisar(`salvo às ${hora}${avisos}`);
  }
});

// O nó novo nasce colado no pai e leva um instante para se afastar. Se ele
// fosse selecionado (e portanto fixado) na hora, ficaria preso em cima do pai;
// por isso a nota nova só abre depois que ele saiu do lugar.
const ESPERA_NOVO_MS = 1200;

const criador = createCriador({
  servidor: editor.pronto,
  onCriado(resposta) {
    const novo = graph.inserir(resposta.nota, resposta.pai, { elapsed: elapsedAtual, arvore: resposta.tree });
    graph.syncCross(resposta.cross);
    atualizarStats(resposta.meta);
    panel.avisar(`${resposta.nota.label} criado${resposta.promovido ? ' — este tópico virou pasta' : ''}`);
    setTimeout(() => {
      select(novo, { force: true });
      editor.entrar();
    }, reduced ? 0 : ESPERA_NOVO_MS);
  }
});

const panel = createPanel({
  onNavigate: (node) => select(node, { force: true }),
  onClose: () => select(null),
  onShow: (node) => { editor.aoMostrar(node); criador.aoMostrar(node); }
});

const slugDoEndereco = () => {
  const m = location.hash.match(/^#\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
};

/**
 * Espelha a seleção no endereço: `#/mcp`. pushState em vez de mexer em
 * location.hash direto, porque pushState não dispara hashchange — então a
 * gente não recebe de volta o eco da própria escrita.
 */
function gravarEndereco(node) {
  const alvo = node && node.slug ? `#/${encodeURIComponent(node.slug)}` : '';
  if (alvo === location.hash || (!alvo && !location.hash)) return;
  try {
    history.pushState(null, '', alvo || location.pathname + location.search);
  } catch { /* ambiente sem history (iframe restrito): segue sem deep link */ }
}

function select(node, { force = false, doEndereco = false } = {}) {
  // Qualquer troca — outro nó, fechar, voltar no histórico — passa por aqui.
  // É o único ponto onde texto não salvo pode ser perdido, então é aqui que
  // se pergunta.
  if (editor.ativo) {
    if (!editor.podeSair()) {
      // o endereço já pode ter mudado (botão voltar): devolve ao nó atual
      if (doEndereco) gravarEndereco(selected);
      return;
    }
    editor.sair();
  }

  if (selected) selected.pinned = false;

  let resultado;
  if (!node) { panel.close(); resultado = null; }
  else if (force) { panel.open(node, graph); resultado = node; }
  else resultado = panel.toggle(node, graph);

  selected = resultado;

  if (selected) {
    selected.pinned = true;
    requestAnimationFrame(() => requestAnimationFrame(aimCamera));
  } else {
    camGoal = null;
  }

  if (!doEndereco) gravarEndereco(selected);
}

/**
 * Endereço → seleção. Idempotente de propósito: back/forward pode disparar
 * popstate E hashchange para a mesma mudança, e a segunda chamada tem que
 * ser um no-op, não um toggle que fecharia o que a primeira abriu.
 */
function lerEndereco() {
  const slug = slugDoEndereco();
  if (!slug) {
    if (selected) select(null, { doEndereco: true });
    return;
  }
  const n = graph.bySlug.get(slug);
  if (!n || (selected && selected.id === n.id)) return;
  select(n, { force: true, doEndereco: true });
}
addEventListener('popstate', lerEndereco);
addEventListener('hashchange', lerEndereco);

// Deep link na carga espera a expansão terminar: selecionar fixa o nó, e
// fixar durante o "boom" o congelaria colado no centro.
if (slugDoEndereco()) setTimeout(lerEndereco, graph.lastBorn + 1200);

function aimCamera() {
  if (!selected) return;
  camGoal = vp.centerFor(selected.x, selected.y, panel.size());
}

function setReadout(n) {
  if (!n) { roEl.classList.remove('on'); return; }
  roName.textContent = n.label;
  const trilha = graph.path[n.id];
  const grau = graph.neighbors[n.id].size;
  const topico = n.children.length === 0 && n.depth > 0;
  roRel.textContent =
    `${trilha.length ? trilha.join(' › ') + ' · ' : ''}` +
    `${grau} ${grau === 1 ? 'conexão' : 'conexões'}` +
    (topico ? ` · ${n.status}` : '');
  roEl.classList.add('on');
}

const input = attachInteraction(vp, graph, {
  onHover: setReadout,
  onSelect: (node) => select(node)
});

// ---------------------------------------------------------------------
//  laço
// ---------------------------------------------------------------------

// O relógio só é zerado no PRIMEIRO frame, não no setup: o timestamp do
// requestAnimationFrame é o início do frame e pode ser anterior a um
// performance.now() lido aqui. Isso daria `elapsed` negativo — e raio
// negativo em ctx.arc lança IndexSizeError, matando o frame inteiro.
let t0 = null;
let last = 0;
let elapsedAtual = 0;   // relógio da animação, lido por quem insere nós novos

function frame(now) {
  if (t0 === null) { t0 = now; last = now; }

  // dt normalizado (1 = um frame a 60fps), com teto para a aba que volta
  // de segundo plano não aplicar um passo gigante e explodir a física
  let dt = (now - last) / 16.6667;
  last = now;
  if (dt > 3) dt = 3;

  const elapsed = Math.max(0, now - t0);
  elapsedAtual = elapsed;
  sim.step(dt, elapsed);

  // a câmera recua devagar enquanto o universo termina de se abrir
  if (kAlvo !== null) {
    vp.cam.k += (kAlvo - vp.cam.k) * Math.min(1, 0.04 * dt);
    if (Math.abs(kAlvo - vp.cam.k) < 0.0005) { vp.cam.k = kAlvo; kAlvo = null; }
  }

  if (camGoal) {
    const a = reduced ? 1 : Math.min(1, 0.10 * dt);
    vp.cam.x += (camGoal.x - vp.cam.x) * a;
    vp.cam.y += (camGoal.y - vp.cam.y) * a;
    if (selected) aimCamera();
  }

  renderer.draw(elapsed, { hovered: input.hovered, selected });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

setTimeout(() => hintEl.classList.add('on'), graph.lastBorn + 800);
setTimeout(() => hintEl.classList.remove('on'), graph.lastBorn + 10000);
