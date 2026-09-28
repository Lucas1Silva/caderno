/**
 * Markdown → HTML — subconjunto deliberado, feito à mão.
 *
 * Cobre o que uma nota de estudo usa: títulos, parágrafos, ênfase, código
 * (em linha e em bloco), listas aninhadas, citações, callouts do Obsidian
 * (`> [!nota]`), tabelas GFM, links, wikilinks e linha horizontal.
 *
 * NÃO cobre: HTML embutido (é escapado de propósito), notas de rodapé,
 * listas com parágrafos múltiplos por item, matemática ($...$ aparece como
 * texto). Para matemática o caminho é KaTeX na hora do build.
 *
 * Por que à mão: é o único trecho onde uma lib (marked, markdown-it) seria
 * tentadora. Mas wikilink é sintaxe do Obsidian, não do CommonMark — eu teria
 * que escrever extensão de qualquer jeito. E o subconjunto testado cabe aqui.
 *
 * Segurança: todo texto é escapado ANTES de qualquer marcação ser aplicada.
 * URLs com esquema diferente de http, https e mailto viram texto.
 */

const esc = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const URL_OK = /^(https?:|mailto:|#|\/|\.{0,2}\/)/i;

/**
 * Extrai os alvos de wikilink de um texto. Aceita [[Alvo]], [[Alvo|apelido]],
 * [[Alvo#seção]], [[pasta/Alvo]] e ![[embed]]. Devolve só o nome do alvo.
 */
export function wikiTargets(text) {
  // Link dentro de código ou de comentário %% é exemplo, não relação.
  // Sem esta limpeza, escrever `[[X]]` para documentar a sintaxe criaria
  // uma aresta de verdade no grafo.
  const limpo = String(text)
    .replace(/^(\s*)(```|~~~)[\s\S]*?^\s*\2\s*$/gm, '')
    .replace(/`[^`\n]+`/g, '')
    .replace(/%%[\s\S]*?%%/g, '');
  const out = [];
  for (const m of limpo.matchAll(/!?\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g)) {
    const alvo = m[1].trim().split('/').pop().trim();
    if (alvo) out.push(alvo);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  inline                                                             */
/* ------------------------------------------------------------------ */

function inline(text, resolve) {
  // 1. protege código em linha: nada dentro dele é interpretado
  const guardados = [];
  const guardar = (html) => `\u0000${guardados.push(html) - 1}\u0000`;

  let s = String(text).replace(/`([^`\n]+)`/g, (_, c) => guardar(`<code>${esc(c)}</code>`));

  // 2. wikilinks — antes de escapar, porque o alvo precisa do texto cru
  s = s.replace(/(!?)\[\[([^\]|#\n]+)(#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]/g, (_, emb, alvo, secao, apelido) => {
    const nome = alvo.trim().split('/').pop().trim();
    const texto = (apelido && apelido.trim()) || nome + (secao ? ` › ${secao.slice(1).trim()}` : '');
    const r = resolve ? resolve(nome) : null;
    if (!r) return guardar(`<span class="wl wl-missing" title="nota inexistente">${esc(texto)}</span>`);
    return guardar(`<a class="wl" href="#/${esc(r.slug)}" data-slug="${esc(r.slug)}">${esc(texto)}</a>`);
  });

  // 3. links markdown — também antes de escapar, pela mesma razão
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (m, txt, url, titulo) => {
    if (!URL_OK.test(url)) return guardar(esc(m));
    const t = titulo ? ` title="${esc(titulo)}"` : '';
    const ext = /^https?:/i.test(url) ? ' target="_blank" rel="noopener noreferrer"' : '';
    return guardar(`<a href="${esc(url)}"${t}${ext}>${inlineSimples(esc(txt))}</a>`);
  });

  // 4. agora sim: escapa o resto e aplica ênfase
  s = inlineSimples(esc(s));

  // 5. devolve o que foi guardado
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => guardados[Number(i)]);
}

function inlineSimples(s) {
  return s
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\s][^_\n]*?)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
}

/* ------------------------------------------------------------------ */
/*  blocos                                                             */
/* ------------------------------------------------------------------ */

const RE = {
  fence: /^(\s*)(```|~~~)\s*([\w+-]*)\s*$/,
  heading: /^(#{1,6})\s+(.+?)\s*#*\s*$/,
  hr: /^\s*([-*_])(\s*\1){2,}\s*$/,
  quote: /^\s*>\s?(.*)$/,
  li: /^(\s*)([-*+]|\d+[.)])\s+(.*)$/,
  tableSep: /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/,
  blank: /^\s*$/
};

const CALLOUTS = {
  note: 'nota', nota: 'nota', info: 'nota',
  tip: 'dica', dica: 'dica', hint: 'dica',
  warning: 'aviso', aviso: 'aviso', caution: 'aviso', attention: 'aviso',
  danger: 'perigo', perigo: 'perigo', error: 'perigo', bug: 'perigo',
  question: 'pergunta', pergunta: 'pergunta', faq: 'pergunta',
  quote: 'citacao', citacao: 'citacao', example: 'exemplo', exemplo: 'exemplo',
  todo: 'todo', success: 'dica', abstract: 'nota', summary: 'nota', tldr: 'nota'
};

function indentOf(s) {
  let n = 0;
  for (const ch of s) { if (ch === ' ') n++; else if (ch === '\t') n += 4; else break; }
  return n;
}

function cells(row) {
  let r = row.trim();
  if (r.startsWith('|')) r = r.slice(1);
  if (r.endsWith('|') && !r.endsWith('\\|')) r = r.slice(0, -1);
  return r.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

function align(sep) {
  return cells(sep).map((c) => {
    const l = c.startsWith(':'), r = c.endsWith(':');
    return l && r ? 'center' : r ? 'right' : l ? 'left' : null;
  });
}

/** Lista aninhada por indentação. Devolve [html, próximaLinha]. */
function lista(lines, i, resolve) {
  const base = indentOf(lines[i]);
  const ordenada = /\d/.test(lines[i].match(RE.li)[2]);
  const tag = ordenada ? 'ol' : 'ul';
  const primeiro = ordenada ? Number(lines[i].match(RE.li)[2].replace(/\D/g, '')) : 1;
  const start = ordenada && primeiro !== 1 ? ` start="${primeiro}"` : '';

  let html = `<${tag}${start}>`;
  while (i < lines.length) {
    const m = lines[i].match(RE.li);
    if (!m) break;
    const ind = indentOf(lines[i]);
    if (ind < base) break;
    if (ind > base) {                      // sublista pertence ao item anterior
      const [sub, j] = lista(lines, i, resolve);
      html = html.replace(/<\/li>$/, `${sub}</li>`);
      i = j;
      continue;
    }
    let conteudo = m[3];
    // continuação preguiçosa: linha seguinte mais indentada e que não é item
    while (i + 1 < lines.length && !RE.blank.test(lines[i + 1]) &&
           !RE.li.test(lines[i + 1]) && indentOf(lines[i + 1]) > base) {
      conteudo += ' ' + lines[++i].trim();
    }
    const tarefa = conteudo.match(/^\[([ xX])\]\s+(.*)$/);
    if (tarefa) {
      const feito = tarefa[1] !== ' ';
      html += `<li class="task${feito ? ' done' : ''}"><span class="check" aria-hidden="true"></span>${inline(tarefa[2], resolve)}</li>`;
    } else {
      html += `<li>${inline(conteudo, resolve)}</li>`;
    }
    i++;
  }
  return [html + `</${tag}>`, i];
}

/**
 * @param {string} md
 * @param {(nome: string) => ({slug: string} | null)} [resolve]
 */
export function render(md, resolve) {
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (RE.blank.test(line)) { i++; continue; }

    // comentário do Obsidian %% ... %% — some do HTML
    if (line.trim().startsWith('%%')) {
      if (!(line.trim().length > 2 && line.trim().endsWith('%%'))) {
        i++;
        while (i < lines.length && !lines[i].includes('%%')) i++;
      }
      i++;
      continue;
    }

    const f = line.match(RE.fence);
    if (f) {
      const marca = f[2];
      const lang = f[3];
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(marca)) buf.push(lines[i++]);
      i++;
      const cls = lang ? ` class="lang-${esc(lang)}"` : '';
      const rotulo = lang ? `<span class="code-lang">${esc(lang)}</span>` : '';
      out.push(`<pre${cls}>${rotulo}<code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }

    const h = line.match(RE.heading);
    if (h) {
      // h1 do corpo vira h2: o título da nota já é o h1 do painel
      const n = Math.min(6, h[1].length + 1);
      out.push(`<h${n}>${inline(h[2], resolve)}</h${n}>`);
      i++;
      continue;
    }

    if (RE.hr.test(line)) { out.push('<hr>'); i++; continue; }

    if (RE.quote.test(line)) {
      const buf = [];
      while (i < lines.length && RE.quote.test(lines[i])) buf.push(lines[i++].match(RE.quote)[1]);
      const c = buf[0].match(/^\[!(\w+)\]([+-]?)\s*(.*)$/);
      if (c) {
        const tipo = CALLOUTS[c[1].toLowerCase()] || 'nota';
        const titulo = c[3] || c[1][0].toUpperCase() + c[1].slice(1).toLowerCase();
        const corpo = render(buf.slice(1).join('\n'), resolve);
        out.push(`<aside class="callout callout-${tipo}"><p class="callout-title">${inline(titulo, resolve)}</p>${corpo}</aside>`);
      } else {
        out.push(`<blockquote>${render(buf.join('\n'), resolve)}</blockquote>`);
      }
      continue;
    }

    if (RE.li.test(line)) {
      const [html, j] = lista(lines, i, resolve);
      out.push(html);
      i = j;
      continue;
    }

    // Separador precisa de `|` próprio: sem isso, um `---` (linha horizontal)
    // logo abaixo de uma frase com `|` seria lido como tabela.
    if (line.includes('|') && i + 1 < lines.length &&
        lines[i + 1].includes('|') && RE.tableSep.test(lines[i + 1])) {
      const cab = cells(line);
      const al = align(lines[i + 1]);
      const st = (k) => (al[k] ? ` style="text-align:${al[k]}"` : '');
      i += 2;
      let html = '<div class="tbl"><table><thead><tr>' +
        cab.map((c, k) => `<th${st(k)}>${inline(c, resolve)}</th>`).join('') +
        '</tr></thead><tbody>';
      while (i < lines.length && lines[i].includes('|') && !RE.blank.test(lines[i])) {
        const row = cells(lines[i++]);
        html += '<tr>' + cab.map((_, k) => `<td${st(k)}>${inline(row[k] ?? '', resolve)}</td>`).join('') + '</tr>';
      }
      out.push(html + '</tbody></table></div>');
      continue;
    }

    // parágrafo: junta linhas até algo que comece outro bloco
    const buf = [line.trim()];
    i++;
    while (i < lines.length && !RE.blank.test(lines[i]) &&
           !RE.fence.test(lines[i]) && !RE.heading.test(lines[i]) &&
           !RE.quote.test(lines[i]) && !RE.li.test(lines[i]) && !RE.hr.test(lines[i])) {
      buf.push(lines[i++].trim());
    }
    out.push(`<p>${inline(buf.join(' '), resolve)}</p>`);
  }

  return out.join('\n');
}

/** Corpo sem nada além de espaço e comentários `%%` conta como nota não escrita. */
export function isEmpty(md) {
  return String(md).replace(/%%[\s\S]*?%%/g, '').trim() === '';
}
