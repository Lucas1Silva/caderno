/**
 * Criar notas pelo painel: o botão "+ Novo" e o formulário que ele abre.
 *
 * Como o editor, só aparece quando existe o servidor local — no site
 * publicado não há onde gravar, e o botão nem surge.
 *
 * Na raiz, o botão cria um DOMÍNIO; em qualquer outro nó, um tópico dentro
 * dele. Se o nó escolhido for um tópico sem filhos, ele vira pasta primeiro
 * (o servidor cuida disso), e o formulário avisa antes.
 *
 * Nada de prompt(): o formulário fica dentro do painel, e o erro aparece ao
 * lado do campo, com a explicação de como consertar.
 */

export function createCriador({ servidor, onCriado } = {}) {
  const botao = document.getElementById('panel-novo');
  const form = document.getElementById('novo');
  const rotulo = document.getElementById('novo-rotulo');
  const campo = document.getElementById('novo-nome');
  const criar = document.getElementById('novo-criar');
  const cancelar = document.getElementById('novo-cancelar');
  const msg = document.getElementById('novo-msg');
  const dica = document.getElementById('novo-dica');

  let disponivel = false;
  let no = null;
  let enviando = false;

  const ehRaiz = (n) => n && n.depth === 0;
  const ehTopico = (n) => n && n.depth > 0 && n.children.length === 0;

  servidor?.then((ok) => { disponivel = Boolean(ok); pintar(); });

  function pintar() {
    botao.hidden = !(disponivel && no && no.slug);
    if (no) botao.textContent = ehRaiz(no) ? '+ Novo domínio' : '+ Novo tópico';
  }

  function abrir() {
    if (!no) return;
    rotulo.textContent = ehRaiz(no) ? 'Nome do domínio novo' : `Nome do tópico novo, dentro de ${no.label}`;
    campo.placeholder = ehRaiz(no) ? 'Python' : 'ex.: Arquitetura RAG';
    dica.textContent = ehTopico(no)
      ? `${no.label} ainda não tem subtópicos: ele vira uma pasta, e a nota dele continua a mesma.`
      : '';
    dica.hidden = !dica.textContent;
    msg.textContent = '';
    campo.value = '';
    form.hidden = false;
    botao.hidden = true;
    campo.focus();
  }

  function fechar() {
    form.hidden = true;
    enviando = false;
    criar.disabled = false;
    pintar();
  }

  async function enviar(e) {
    e.preventDefault();
    if (enviando || !no) return;
    const nome = campo.value.trim();
    if (!nome) {
      msg.textContent = 'Digite um nome.';
      campo.focus();
      return;
    }
    enviando = true;
    criar.disabled = true;
    msg.textContent = 'criando…';
    try {
      const r = await fetch('/api/nota', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pai: no.slug, nome })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erro || r.statusText);
      fechar();
      onCriado?.(d);
    } catch (err) {
      enviando = false;
      criar.disabled = false;
      msg.textContent = err.message;
      campo.focus();
    }
  }

  botao.addEventListener('click', abrir);
  form.addEventListener('submit', enviar);
  cancelar.addEventListener('click', fechar);
  campo.addEventListener('input', () => { if (!enviando) msg.textContent = ''; });
  campo.addEventListener('keydown', (e) => {
    // Esc fecha só o formulário, não o painel inteiro
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); }
  });

  return {
    get disponivel() { return disponivel; },
    get aberto() { return !form.hidden; },
    /** Chamado pelo painel sempre que ele mostra um nó. */
    aoMostrar(n) { no = n; form.hidden = true; enviando = false; criar.disabled = false; pintar(); },
    abrir,
    fechar
  };
}
