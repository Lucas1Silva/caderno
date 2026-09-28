/**
 * Lê um vault do Obsidian e devolve a árvore do caderno + arestas.
 *
 * REGRAS
 *   - A pasta é a hierarquia. Cada pasta é um nó.
 *   - A nota de uma pasta é o arquivo com o MESMO nome dela, dentro dela:
 *     `Arquitetura/Arquitetura.md`. Não `index.md`, porque o Obsidian
 *     resolve `[[Arquitetura]]` pelo nome do arquivo.
 *   - A raiz é `<vault>/<rootName>.md`.
 *   - Pasta ou arquivo começando com `.` ou `_` é ignorado. É onde mora o
 *     `.obsidian/`, o `_raw/` (material bruto) e o `_templates/`.
 *   - Arestas vêm de wikilinks no corpo E em qualquer valor do frontmatter
 *     (o Obsidian também lê links nas propriedades).
 *
 * Erros (param o build): nome de arquivo repetido — o Obsidian não saberia
 * qual abrir — e slug repetido — o deep link apontaria para dois lugares.
 * Avisos (build segue): slug ausente, status desconhecido, link quebrado,
 * domínio sem matiz.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, basename, extname } from 'node:path';
import { parse } from './frontmatter.mjs';
import { render, isEmpty, wikiTargets } from './markdown.mjs';

export const STATUS = ['vazio', 'rascunho', 'estudado', 'reproduzido'];

/**
 * Arcos usados quando um domínio não declara `matiz`. Em ordem de
 * distância máxima entre si, para que os primeiros domínios fiquem bem
 * separados no círculo cromático.
 */
const ARCOS_LIVRES = [[22, 95], [185, 255], [110, 165], [275, 330], [340, 380]];

export function slugify(s) {
  return String(s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'nota';
}

const ignorado = (nome) => nome.startsWith('.') || nome.startsWith('_');

/**
 * Chave de comparação de nome. NFC porque o mesmo "ê" pode chegar em duas
 * formas Unicode — composta (um caractere) ou decomposta ("e" + acento).
 * O macOS grava a segunda; o Windows e o Linux, a primeira. Sem normalizar,
 * [[Consistência]] e Consistência.md poderiam ser strings diferentes.
 */
export const chaveDe = (nome) => String(nome).normalize('NFC').toLowerCase();

/**
 * Mojibake: UTF-8 lido como a codificação antiga do DOS (CP437) ou como
 * Latin-1. É o que acontece quando um zip sem a flag UTF-8 é extraído no
 * Windows — "ê" vira "├¬", "ç" vira "├º". Detectar aqui transforma um site
 * silenciosamente corrompido num erro com instrução de conserto.
 */
const MOJIBAKE = /├[\u00A0-\u00FF\u2500-\u25FF]|[ÃÂ][\u0080-\u00BF]/;

/**
 * Primeiro arco de cor que não se sobrepõe a nenhum dos declarados, ou null.
 * Usado pelo build (domínio sem `matiz`) e pelo servidor (domínio novo).
 */
export function arcoLivre(declarados) {
  return ARCOS_LIVRES.find((a) => !declarados.some((d) => sobrepoe(a, d))) || null;
}

function sobrepoe(a, b) {
  const norm = ([x, y]) => [((x % 360) + 360) % 360, ((x % 360) + 360) % 360 + (y - x)];
  const [a0, a1] = norm(a), [b0, b1] = norm(b);
  for (const d of [-360, 0, 360]) if (a0 < b1 + d && b0 + d < a1) return true;
  return false;
}

/**
 * @param {string} dir         caminho do vault
 * @param {object} [opts]
 * @param {string} [opts.rootName='Caderno']
 * @returns {Promise<{ tree, cross, notes, warnings, errors }>}
 */
export async function readVault(dir, { rootName = 'Caderno' } = {}) {
  const warnings = [];
  const errors = [];
  const notes = [];                 // todo nó, na ordem de descoberta
  const porNome = new Map();        // basename minúsculo → nó (resolução de wikilink)

  async function lerNota(caminho) {
    try { return await readFile(caminho, 'utf8'); } catch { return null; }
  }

  function criarNo({ label, arquivo, texto, profundidade }) {
    const fm = texto === null ? { data: {}, body: '' } : parse(texto);
    const d = fm.data;
    const rel = arquivo ? relative(dir, arquivo).split('\\').join('/') : null;

    let status = typeof d.status === 'string' ? d.status.trim().toLowerCase() : 'vazio';
    if (!STATUS.includes(status)) {
      warnings.push(`${rel}: status "${d.status}" desconhecido — usando "vazio". Válidos: ${STATUS.join(', ')}.`);
      status = 'vazio';
    }

    const slugGravado = typeof d.slug === 'string' && d.slug.trim() !== '' ? d.slug.trim() : null;

    const no = {
      label: (typeof d.titulo === 'string' && d.titulo.trim()) || label,
      nome: label,                  // nome do arquivo: é por ele que o Obsidian resolve
      slug: slugGravado || slugify(label),
      slugGravado: Boolean(slugGravado),
      status,
      ordem: typeof d.ordem === 'number' ? d.ordem : null,
      hue: Array.isArray(d.matiz) && d.matiz.length === 2 && d.matiz.every(Number.isFinite) ? d.matiz : null,
      arquivo: rel,
      profundidade,
      corpo: fm.body || '',
      frontmatter: d,
      children: []
    };

    notes.push(no);
    if (MOJIBAKE.test(label)) {
      errors.push(
        `nome de arquivo corrompido: "${rel ?? label}". Isso é UTF-8 lido na codificação errada — ` +
        `quase sempre um zip extraído pelo Windows Explorer. Apague a pasta e extraia de novo ` +
        `com 7-Zip, ou use git clone.`
      );
    }
    const chave = chaveDe(label);
    if (porNome.has(chave)) {
      errors.push(`nome repetido "${label}": ${porNome.get(chave).arquivo ?? '(pasta)'} e ${rel ?? '(pasta)'}. O Obsidian não saberia qual abrir com [[${label}]].`);
    } else {
      porNome.set(chave, no);
    }
    return no;
  }

  async function andar(pasta, no, profundidade) {
    let entradas;
    try { entradas = await readdir(pasta, { withFileTypes: true }); }
    catch (e) { errors.push(`não consegui ler ${pasta}: ${e.message}`); return; }

    const notaDaPasta = profundidade === 0 ? `${rootName}.md` : `${basename(pasta)}.md`;

    for (const e of entradas) {
      if (ignorado(e.name)) continue;
      const caminho = join(pasta, e.name);

      if (e.isDirectory()) {
        const nome = e.name;
        const arquivo = join(caminho, `${nome}.md`);
        const texto = await lerNota(arquivo);
        const filho = criarNo({
          label: nome,
          arquivo: texto === null ? null : arquivo,
          texto,
          profundidade: profundidade + 1
        });
        if (texto === null) filho.arquivo = relative(dir, caminho).split('\\').join('/') + '/';
        no.children.push(filho);
        await andar(caminho, filho, profundidade + 1);
      } else if (e.isFile() && extname(e.name).toLowerCase() === '.md' && e.name !== notaDaPasta) {
        const texto = await lerNota(caminho);
        no.children.push(criarNo({
          label: basename(e.name, extname(e.name)),
          arquivo: caminho,
          texto,
          profundidade: profundidade + 1
        }));
      }
    }
  }

  const arquivoRaiz = join(dir, `${rootName}.md`);
  const textoRaiz = await lerNota(arquivoRaiz);
  if (textoRaiz === null) warnings.push(`${rootName}.md não encontrado na raiz do vault — a raiz fica sem nota.`);
  const raiz = criarNo({ label: rootName, arquivo: textoRaiz === null ? null : arquivoRaiz, texto: textoRaiz, profundidade: 0 });

  await andar(dir, raiz, 0);

  // ---- slugs repetidos ----
  const porSlug = new Map();
  for (const n of notes) {
    if (porSlug.has(n.slug)) {
      errors.push(`slug repetido "${n.slug}": ${porSlug.get(n.slug).arquivo} e ${n.arquivo}. Deep links ficariam ambíguos.`);
    } else porSlug.set(n.slug, n);
  }
  for (const n of notes) {
    if (!n.slugGravado && n.arquivo && !n.arquivo.endsWith('/')) {
      warnings.push(`${n.arquivo}: sem slug gravado — usando "${n.slug}". Rode com --fix para fixar.`);
    }
  }

  // ---- ordem dos irmãos: `ordem` primeiro, depois alfabética em pt ----
  (function ordenar(n) {
    n.children.sort((a, b) => {
      const oa = a.ordem ?? Infinity, ob = b.ordem ?? Infinity;
      return oa !== ob ? oa - ob : a.label.localeCompare(b.label, 'pt');
    });
    n.children.forEach(ordenar);
  })(raiz);

  // ---- matiz dos domínios: declarado ou atribuído de um arco livre ----
  const declarados = raiz.children.map((d) => d.hue).filter(Boolean);
  const livres = ARCOS_LIVRES.filter((a) => !declarados.some((d) => sobrepoe(a, d)));
  for (const d of raiz.children) {
    if (d.hue) continue;
    const arco = livres.shift();
    if (arco) {
      d.hue = arco;
      warnings.push(`${d.arquivo ?? d.label}: domínio sem "matiz" — atribuído [${arco}]. Grave no frontmatter para fixar.`);
    } else {
      d.hue = [0, 40];
      warnings.push(`${d.arquivo ?? d.label}: sem "matiz" e sem arco livre sobrando — usando [0, 40].`);
    }
  }

  // ---- resolução de wikilink: por nome de arquivo, sem diferenciar caixa ----
  const resolver = (nome) => porNome.get(chaveDe(nome)) || null;

  // ---- corpo → HTML ----
  for (const n of notes) {
    n.vazio = isEmpty(n.corpo);
    n.html = n.vazio ? '' : render(n.corpo, (nome) => {
      const alvo = resolver(nome);
      return alvo ? { slug: alvo.slug } : null;
    });
  }

  // ---- arestas: wikilinks do corpo + de qualquer valor do frontmatter ----
  const paiDe = new Map();
  (function mapear(n) { for (const c of n.children) { paiDe.set(c, n); mapear(c); } })(raiz);

  const vistas = new Set();
  const cross = [];
  const textosDoFrontmatter = (v) =>
    Array.isArray(v) ? v.flatMap(textosDoFrontmatter) : typeof v === 'string' ? [v] : [];

  for (const n of notes) {
    const alvos = [
      ...wikiTargets(n.corpo),
      ...Object.values(n.frontmatter).flatMap(textosDoFrontmatter).flatMap(wikiTargets)
    ];
    for (const nome of alvos) {
      const alvo = resolver(nome);
      if (!alvo) { warnings.push(`${n.arquivo}: link quebrado [[${nome}]].`); continue; }
      if (alvo === n) continue;
      // parentesco já é aresta; repetir só duplicaria a mola
      if (paiDe.get(n) === alvo || paiDe.get(alvo) === n) continue;
      const k = [n.slug, alvo.slug].sort().join('\u0000');
      if (vistas.has(k)) continue;
      vistas.add(k);
      cross.push([n.slug, alvo.slug]);
    }
  }

  for (const n of notes) {
    if (n.profundidade !== 1 && n.frontmatter.matiz !== undefined) {
      warnings.push(`${n.arquivo}: "matiz" só vale em domínio (pasta de primeiro nível) — ignorado aqui.`);
    }
  }

  // ---- saída: só o que o navegador precisa ----
  const limpar = (n) => ({
    label: n.label,
    slug: n.slug,
    status: n.status,
    vazio: n.vazio,
    html: n.html,
    ...(n.hue && n.profundidade === 1 ? { hue: n.hue } : {}),
    children: n.children.map(limpar)
  });

  return { tree: limpar(raiz), cross, notes, warnings, errors };
}
