/**
 * Edição da nota dentro do painel.
 *
 * Só aparece quando existe o servidor local (tools/serve.mjs). No site
 * publicado não há API, o ping falha, e o botão "Editar" simplesmente não
 * surge — o mesmo código serve os dois casos, sem configuração.
 *
 * O texto vai cru para o servidor, que grava no .md preservando o
 * frontmatter e devolve o HTML já renderizado e as arestas novas. Salvar é
 * a pré-visualização: localmente leva dezenas de milissegundos.
 *
 * Texto não salvo nunca se perde em silêncio: trocar de nó, fechar o
 * painel, voltar no histórico ou fechar a aba pedem confirmação.
 */

const STATUS = ['vazio', 'rascunho', 'estudado', 'reproduzido'];

export function createEditor({ onSalvo } = {}) {
  const painel = document.getElementById('panel');
  const btnEditar = document.getElementById('panel-edit');
  const vista = document.getElementById('panel-view');
  const caixa = document.getElementById('editor');
  const texto = document.getElementById('ed-texto');
  const grupoStatus = document.getElementById('ed-status');
  const msg = document.getElementById('ed-msg');
  const btnSalvar = document.getElementById('ed-salvar');
  const btnCancelar = document.getElementById('ed-cancelar');

  let disponivel = false;
  let no = null;              // nó sendo exibido no painel
  let ativo = false;          // em modo de edição
  let original = '';          // texto ao entrar, para saber se está sujo
  let statusOriginal = '';
  let status = 'vazio';
  let salvando = false;

  const ehTopico = (n) => n && n.children.length === 0 && n.depth > 0;

  // ---- descobre se há servidor local; falha em silêncio no site publicado ----
  const pronto = (async () => {
    if (!/^https?:$/.test(location.protocol)) return false;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 1500);
      const r = await fetch('/api/ping', { cache: 'no-store', signal: ctl.signal });
      clearTimeout(t);
      disponivel = r.ok && (await r.json()).editavel === true;
    } catch { disponivel = false; }
    atualizarBotao();
    return disponivel;
  })();

  function atualizarBotao() {
    btnEditar.hidden = !(disponivel && no && no.slug && !ativo);
  }

  function marcarStatus(s) {
    status = s;
    for (const b of grupoStatus.querySelectorAll('button')) {
      b.setAttribute('aria-checked', String(b.dataset.status === s));
    }
    atualizarSujo();
  }

  const sujo = () => ativo && (texto.value !== original || status !== statusOriginal);

  // O botão nunca fica desabilitado por "nada mudou": desabilitado, ele só
  // ficava um pouco mais apagado e o clique não dizia nada — parecia quebrado.
  // Agora ele sempre responde, e só trava enquanto uma gravação está em curso.
  function atualizarSujo() {
    btnSalvar.disabled = salvando;
    if (!salvando) msg.textContent = sujo() ? 'alterações não salvas' : '';
  }

  function crescer() {
    texto.style.height = 'auto';
    texto.style.height = Math.max(texto.scrollHeight, 260) + 'px';
  }

  // monta os botões de status uma vez
  for (const s of STATUS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.status = s;
    b.setAttribute('role', 'radio');
    b.textContent = s;
    b.addEventListener('click', () => marcarStatus(s));
    grupoStatus.appendChild(b);
  }

  async function entrar() {
    if (!disponivel || !no || ativo) return;
    msg.textContent = 'carregando…';
    try {
      const r = await fetch(`/api/nota?slug=${encodeURIComponent(no.slug)}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro || r.statusText);
      original = d.corpo;
      statusOriginal = d.status;
      texto.value = d.corpo;
      ativo = true;
      grupoStatus.hidden = !ehTopico(no);
      marcarStatus(d.status);
      painel.classList.add('editando');
      vista.hidden = true;
      caixa.hidden = false;
      atualizarBotao();
      atualizarSujo();
      crescer();
      texto.focus();
      texto.setSelectionRange(texto.value.length, texto.value.length);
    } catch (e) {
      msg.textContent = '';
      alert(`Não consegui abrir a nota para edição: ${e.message}`);
    }
  }

  function sair() {
    ativo = false;
    salvando = false;
    painel.classList.remove('editando');
    caixa.hidden = true;
    vista.hidden = false;
    msg.textContent = '';
    atualizarBotao();
  }

  /** true se pode descartar; pergunta se houver texto não salvo. */
  function podeSair() {
    if (!sujo()) return true;
    return confirm('Há alterações não salvas nesta nota. Descartar?');
  }

  async function salvar() {
    if (!ativo || salvando) return;
    if (!sujo()) {
      msg.textContent = 'nada mudou desde que você abriu a nota';
      return;
    }
    salvando = true;
    btnSalvar.disabled = true;
    msg.textContent = 'salvando…';
    try {
      const corpo = { corpo: texto.value };
      if (ehTopico(no)) corpo.status = status;
      const r = await fetch(`/api/nota?slug=${encodeURIComponent(no.slug)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo)
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro || r.statusText);
      original = texto.value;
      statusOriginal = status;
      const alvo = no;
      sair();
      onSalvo?.(alvo, d);
    } catch (e) {
      salvando = false;
      msg.textContent = `não salvou: ${e.message}`;
      btnSalvar.disabled = false;
    }
  }

  function cancelar() {
    if (!podeSair()) return;
    sair();
  }

  // ---- teclado ----
  texto.addEventListener('input', () => { atualizarSujo(); crescer(); });
  texto.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      salvar();
    } else if (e.key === 'Escape') {
      // Esc sai da edição, não fecha o painel inteiro
      e.preventDefault();
      e.stopPropagation();
      cancelar();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      // Tab indenta (listas aninhadas); Esc continua sendo a saída por teclado
      e.preventDefault();
      const { selectionStart: a, selectionEnd: b, value } = texto;
      texto.value = value.slice(0, a) + '  ' + value.slice(b);
      texto.setSelectionRange(a + 2, a + 2);
      atualizarSujo();
    }
  });

  btnEditar.addEventListener('click', entrar);
  btnSalvar.addEventListener('click', salvar);
  btnCancelar.addEventListener('click', cancelar);

  addEventListener('beforeunload', (e) => {
    if (sujo()) { e.preventDefault(); e.returnValue = ''; }
  });

  return {
    pronto,
    get disponivel() { return disponivel; },
    get ativo() { return ativo; },
    get sujo() { return sujo(); },
    /** Chamado pelo painel sempre que ele mostra um nó. */
    aoMostrar(n) { no = n; atualizarBotao(); },
    podeSair,
    sair,
    entrar,
    salvar
  };
}
