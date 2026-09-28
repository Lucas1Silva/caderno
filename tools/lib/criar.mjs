/**
 * Criar uma nota nova: validação do nome e o plano de onde ela vai morar.
 *
 * Tudo aqui é puro — nenhuma função toca o disco. O servidor pede um plano,
 * executa as operações de arquivo e desfaz tudo se o build reclamar. Separar
 * as duas coisas é o que deixa testar as regras sem montar um vault de
 * verdade para cada caso.
 *
 * ONDE A NOTA NASCE
 *   - filha da raiz        → um domínio novo: `vault/<nome>.md`, com `matiz`
 *   - filha de uma pasta   → `<pasta>/<nome>.md`
 *   - filha de um tópico   → o tópico vira pasta primeiro ("promoção"):
 *                            `Sub/Tópico.md` passa a `Sub/Tópico/Tópico.md`,
 *                            e a filha nasce ao lado dele.
 *
 * A promoção move um arquivo, mas não quebra nada: links resolvem pelo nome
 * da nota, não pelo caminho, e o slug está gravado no frontmatter.
 */

import { posix } from 'node:path';
import { slugify, chaveDe, arcoLivre } from './vault.mjs';

const erro = (status, mensagem) => Object.assign(new Error(mensagem), { status });

/** Caracteres que o Windows proíbe em nome de arquivo. */
const PROIBIDOS_ARQUIVO = /[\\/:*?"<>|]/;
/** Caracteres que quebrariam um [[link]]: fim do link, seção, apelido, bloco. */
const PROIBIDOS_LINK = /[[\]#^]/;
const CONTROLE = /[\u0000-\u001F\u007F]/;
const RESERVADOS_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export const TAMANHO_MAXIMO = 80;

/**
 * @returns {string} o nome limpo (sem espaços nas pontas, espaços internos
 *   colapsados, Unicode em NFC)
 * @throws {Error & {status: 400}} com a explicação e o conserto
 */
export function validarNome(bruto) {
  if (typeof bruto !== 'string') throw erro(400, 'Falta o nome da nota.');
  const nome = bruto.normalize('NFC').replace(/\s+/g, ' ').trim();

  if (!nome) throw erro(400, 'Falta o nome da nota.');
  if (nome.length > TAMANHO_MAXIMO) {
    throw erro(400, `O nome tem ${nome.length} caracteres; o limite é ${TAMANHO_MAXIMO}. Use um nome curto e ponha o detalhe no texto da nota.`);
  }
  if (CONTROLE.test(nome)) throw erro(400, 'O nome tem um caractere invisível. Digite-o de novo.');
  const arq = nome.match(PROIBIDOS_ARQUIVO);
  if (arq) {
    throw erro(400, `O nome não pode ter "${arq[0]}": o sistema de arquivos não aceita. Troque por outro caractere, como "," ou "-".`);
  }
  const link = nome.match(PROIBIDOS_LINK);
  if (link) {
    throw erro(400, `O nome não pode ter "${link[0]}": ele quebraria os [[links]] para esta nota.`);
  }
  if (nome.startsWith('.') || nome.startsWith('_')) {
    throw erro(400, 'O nome não pode começar com "." ou "_": pastas e notas assim são ignoradas pelo caderno.');
  }
  if (nome.endsWith('.')) throw erro(400, 'O nome não pode terminar em ponto: o Windows não aceita.');
  if (RESERVADOS_WINDOWS.test(nome)) {
    throw erro(400, `"${nome}" é um nome reservado do Windows. Acrescente uma palavra.`);
  }
  return nome;
}

/**
 * Onde e como a nota nova vai ser criada.
 *
 * @param {object} estado   resultado de readVault (precisa de notes e tree)
 * @param {object} pedido   { pai: slug do nó pai, nome: nome da nota nova }
 * @returns {{
 *   nome: string, slug: string, profundidade: number,
 *   arquivo: string,                       caminho relativo ao vault
 *   promover: null | { de: string, para: string, pasta: string },
 *   matiz: null | [number, number],
 *   conteudo: string
 * }}
 */
export function planejarCriacao(estado, { pai, nome: bruto }) {
  const nome = validarNome(bruto);

  const noPai = estado.notes.find((n) => n.slug === pai);
  if (!noPai) throw erro(404, `A nota "${pai}" não existe mais. Recarregue a página.`);

  const existente = estado.notes.find((n) => chaveDe(n.nome) === chaveDe(nome));
  if (existente) {
    const onde = existente.arquivo ? ` (em ${existente.arquivo})` : '';
    throw erro(409, `Já existe uma nota chamada "${existente.nome}"${onde}. Os nomes precisam ser únicos: é por eles que os [[links]] encontram cada nota.`);
  }

  // slug único; se "mcp" já existe, "MCP!" vira "mcp-2"
  const slugs = new Set(estado.notes.map((n) => n.slug));
  const base = slugify(nome);
  let slug = base;
  for (let i = 2; slugs.has(slug); i++) slug = `${base}-${i}`;

  // a pasta onde a filha vai morar
  let pasta;
  let promover = null;
  if (noPai.profundidade === 0) {
    pasta = '';
  } else if (!noPai.arquivo) {
    throw erro(409, `A nota "${noPai.nome}" não tem arquivo no vault.`);
  } else if (noPai.arquivo.endsWith('/')) {
    pasta = noPai.arquivo.slice(0, -1);
  } else {
    const dir = posix.dirname(noPai.arquivo);
    const nomeArquivo = posix.basename(noPai.arquivo, '.md');
    if (dir !== '.' && posix.basename(dir) === nomeArquivo) {
      pasta = dir;                                   // já é nota-de-pasta
    } else {
      pasta = dir === '.' ? nomeArquivo : `${dir}/${nomeArquivo}`;
      promover = { de: noPai.arquivo, para: `${pasta}/${nomeArquivo}.md`, pasta };
    }
  }

  const profundidade = noPai.profundidade + 1;
  const matiz = profundidade === 1
    ? arcoLivre(estado.tree.children.map((d) => d.hue).filter(Boolean))
    : null;

  const conteudo =
    '---\n' +
    `slug: ${slug}\n` +
    'status: vazio\n' +
    (matiz ? `matiz: [${matiz[0]}, ${matiz[1]}]\n` : '') +
    '---\n';

  return {
    nome,
    slug,
    profundidade,
    arquivo: pasta ? `${pasta}/${nome}.md` : `${nome}.md`,
    promover,
    matiz,
    conteudo
  };
}
