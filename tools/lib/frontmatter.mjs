/**
 * Leitor de frontmatter YAML — subconjunto deliberado.
 *
 * Cobre o que um vault de notas usa: escalar (texto, número, booleano),
 * lista em linha `[a, b]` e lista em bloco `- item`, com ou sem aspas.
 * NÃO cobre: objetos aninhados, âncoras, strings multilinha (| e >).
 * Se um dia você precisar disso, troque por `yaml` do npm em vez de
 * estender este arquivo — um parser YAML completo é um buraco sem fundo.
 *
 * Por que não usar a lib agora: é a única coisa do projeto que exigiria
 * dependência externa, e o subconjunto cabe em 100 linhas testadas.
 */

/** Remove BOM e normaliza fim de linha. O git no Windows pode entregar CRLF. */
export function normalize(text) {
  return String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function unquote(s) {
  const t = s.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))) {
    const inner = t.slice(1, -1);
    return t[0] === '"'
      ? inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      : inner.replace(/''/g, "'");
  }
  return t;
}

/** Tira comentário `# ...` de valor sem aspas. Dentro de aspas, `#` é texto. */
function stripComment(v) {
  const t = v.trim();
  if (t.startsWith('"') || t.startsWith("'")) return t;
  const i = t.search(/\s#/);
  return i === -1 ? t : t.slice(0, i).trim();
}

function scalar(raw) {
  const v = stripComment(raw);
  if (v === '') return '';
  if (v.startsWith('"') || v.startsWith("'")) return unquote(v);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

/** Divide `a, "b, c", d` respeitando aspas. */
function splitFlow(inner) {
  const out = [];
  let cur = '';
  let q = null;
  for (const ch of inner) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === ',') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') out.push(cur);
  return out.map((s) => scalar(s));
}

function value(raw) {
  const v = stripComment(raw);
  // `[[X]]` sem aspas NÃO é lista em linha — é wikilink. YAML de verdade
  // quebraria aqui; tratamos como texto para não surpreender quem escreve.
  if (v.startsWith('[') && v.endsWith(']') && !v.startsWith('[[')) {
    return splitFlow(v.slice(1, -1));
  }
  return scalar(v);
}

/**
 * @returns {{ data: object, body: string, hasFrontmatter: boolean, fmEnd: number }}
 *   fmEnd = índice da linha logo após o `---` de fechamento (para edição cirúrgica)
 */
export function parse(text) {
  const src = normalize(text);
  const lines = src.split('\n');

  if (lines[0].trim() !== '---') {
    return { data: {}, body: src, hasFrontmatter: false, fmEnd: 0 };
  }

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---' || lines[i].trim() === '...') { end = i; break; }
  }
  if (end === -1) {
    // frontmatter aberto e nunca fechado: trata o arquivo inteiro como corpo
    return { data: {}, body: src, hasFrontmatter: false, fmEnd: 0 };
  }

  const data = {};
  let listKey = null;
  const semItens = new Set();   // chaves `x:` sem valor que ainda não receberam item

  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (/^\s*(#.*)?$/.test(line)) continue;

    const item = line.match(/^\s+-\s?(.*)$/) || line.match(/^-\s(.*)$/);
    if (item && listKey) {
      data[listKey].push(scalar(item[1]));
      semItens.delete(listKey);
      continue;
    }

    const kv = line.match(/^([A-Za-zÀ-ÿ0-9_-]+)\s*:\s*(.*)$/);
    if (kv) {
      const [, key, rest] = kv;
      if (stripComment(rest) === '') {
        data[key] = [];          // provisório: vira lista se vierem itens
        listKey = key;
        semItens.add(key);
      } else {
        data[key] = value(rest);
        listKey = null;
      }
    }
  }

  // `slug:` sem nada depois e sem itens abaixo é valor vazio, não lista.
  // (`relacionados: []` explícito não passa por aqui e continua lista.)
  for (const k of semItens) data[k] = '';

  return {
    data,
    body: lines.slice(end + 1).join('\n'),
    hasFrontmatter: true,
    fmEnd: end + 1
  };
}

/**
 * Grava `chave: valor` no frontmatter sem reformatar o resto do arquivo.
 * Substitui a linha se a chave existir; senão insere antes do `---` final;
 * se não houver frontmatter, cria. Usado pelo `--fix` para gravar slugs.
 */
export function setKey(text, key, val) {
  const src = normalize(text);
  const lines = src.split('\n');
  const linha = `${key}: ${val}`;
  const fm = parse(src);

  if (!fm.hasFrontmatter) return `---\n${linha}\n---\n${src}`;

  const close = fm.fmEnd - 1;
  for (let i = 1; i < close; i++) {
    if (new RegExp(`^${key}\\s*:`).test(lines[i])) {
      lines[i] = linha;
      return lines.join('\n');
    }
  }
  lines.splice(close, 0, linha);
  return lines.join('\n');
}
