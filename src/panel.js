/**
 * Painel lateral — a nota de cada nó.
 *
 * Alternância: clicar num nó abre; clicar no MESMO nó fecha; clicar em
 * OUTRO troca o conteúdo sem fechar. Uma instância só de painel.
 *
 * É DOM, não canvas: texto formatado, seleção, rolagem e leitor de tela
 * saem de graça. O HTML do corpo chega pronto do build (tools/build.mjs),
 * já escapado — o navegador não parseia Markdown.
 *
 * Links dentro da nota e as conexões no rodapé navegam o grafo: dá para
 * andar pelo caderno inteiro pelo texto, sem caçar bolinha na tela.
 */

const ROTULO_STATUS = {
  vazio: 'vazio',
  rascunho: 'rascunho',
  estudado: 'estudado',
  reproduzido: 'reproduzido do zero'
};

export function createPanel({ onNavigate, onClose, onShow } = {}) {
  const el = document.getElementById('panel');
  const elPath = document.getElementById('panel-path');
  const elTitle = document.getElementById('panel-title');
  const elStatus = document.getElementById('panel-status');
  const elBody = document.getElementById('panel-body');
  const elLinks = document.getElementById('panel-links');
  const elClose = document.getElementById('panel-close');
  const elScroll = el.querySelector('.panel-scroll');
  const elAviso = document.getElementById('panel-aviso');
  let timerAviso = null;

  let atual = null;
  let grafo = null;

  // quem decide se fecha é o dono da seleção (pode haver texto não salvo)
  elClose.addEventListener('click', () => onClose?.());

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && atual) onClose?.();
  });

  // um ouvinte só para todos os links internos da nota (delegação)
  elBody.addEventListener('click', (e) => {
    const a = e.target.closest('a.wl[data-slug]');
    if (!a || !grafo) return;
    e.preventDefault();
    const alvo = grafo.bySlug.get(a.dataset.slug);
    if (alvo) onNavigate?.(alvo);
  });

  function render(node) {
    const trilha = grafo.path[node.id];
    elPath.textContent = trilha.length ? trilha.join(' › ') : 'raiz';
    elTitle.textContent = node.label;

    const topico = node.children.length === 0 && node.depth > 0;
    elStatus.hidden = !topico;
    if (topico) {
      elStatus.dataset.status = node.status;
      elStatus.textContent = ROTULO_STATUS[node.status] || node.status;
    }

    if (node.html && !node.vazio) {
      elBody.innerHTML = node.html;
    } else {
      const filhos = node.children.length;
      elBody.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'panel-empty';
      p.textContent = filhos
        ? `${filhos} ${filhos === 1 ? 'subtópico' : 'subtópicos'}. Nota ainda não escrita.`
        : 'Nota ainda não escrita.';
      elBody.appendChild(p);
    }

    const cruzadas = [...grafo.neighbors[node.id]]
      .filter((id) => id !== node.parent && !node.children.includes(id));

    elLinks.innerHTML = '';
    if (cruzadas.length) {
      const h = document.createElement('h3');
      h.textContent = 'Conecta com';
      elLinks.appendChild(h);
      const ul = document.createElement('ul');
      for (const id of cruzadas) {
        const alvo = grafo.nodes[id];
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = alvo.label;
        b.style.setProperty('--chip-h', alvo.h === null ? '40' : String(Math.round(alvo.h)));
        b.addEventListener('click', () => onNavigate?.(alvo));
        li.appendChild(b);
        ul.appendChild(li);
      }
      elLinks.appendChild(ul);
    }

    if (node.h === null) el.style.removeProperty('--panel-h');
    else el.style.setProperty('--panel-h', String(Math.round(node.h)));

    onShow?.(node);
  }

  function open(node, graph) {
    grafo = graph;
    atual = node;
    render(node);
    el.classList.add('on');
    el.setAttribute('aria-hidden', 'false');
    elScroll.scrollTop = 0;
  }

  function close() {
    atual = null;
    el.classList.remove('on');
    el.setAttribute('aria-hidden', 'true');
  }

  /** Mesmo nó fecha; nó diferente troca o conteúdo. Devolve o nó aberto ou null. */
  function toggle(node, graph) {
    if (!node) { close(); return null; }
    if (atual && atual.id === node.id) { close(); return null; }
    open(node, graph);
    return node;
  }

  /** Espaço que o painel ocupa, para a câmera não centralizar atrás dele. */
  function size() {
    if (!atual) return { right: 0, bottom: 0 };
    const r = el.getBoundingClientRect();
    return matchMedia('(max-width: 760px)').matches
      ? { right: 0, bottom: r.height }
      : { right: r.width, bottom: 0 };
  }

  /** Redesenha a nota aberta — depois de salvar, por exemplo. */
  function refresh() { if (atual) render(atual); }

  /** Confirmação curta ao lado do status: "salvo às 10:47". Some sozinha. */
  function avisar(texto, ms = 5000) {
    if (!elAviso) return;
    clearTimeout(timerAviso);
    elAviso.textContent = texto;
    elAviso.hidden = false;
    timerAviso = setTimeout(() => { elAviso.hidden = true; }, ms);
  }

  return { open, close, toggle, size, refresh, avisar, get current() { return atual; } };
}
