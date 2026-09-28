/**
 * Vault → src/data/caderno.gen.js. Compartilhado entre o build (linha de
 * comando) e o servidor local (que regera a cada nota salva).
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { readVault } from './vault.mjs';

export function resumo(res) {
  const folhas = res.notes.filter((n) => n.children.length === 0 && n.profundidade > 0);
  const porStatus = Object.fromEntries(
    ['vazio', 'rascunho', 'estudado', 'reproduzido'].map((s) => [s, folhas.filter((n) => n.status === s).length])
  );
  return {
    notas: res.notes.length,
    topicos: folhas.length,
    escritas: res.notes.filter((n) => !n.vazio).length,
    porStatus,
    arestas: res.cross.length
  };
}

export function modulo(res) {
  return `// GERADO por tools/build.mjs a partir de vault/ — não edite à mão.
// Edite as notas pelo próprio caderno (node tools/serve.mjs) ou por qualquer editor.

export const CADERNO = ${JSON.stringify(res.tree, null, 2)};

export const CROSS = ${JSON.stringify(res.cross)};

export const META = ${JSON.stringify(resumo(res))};
`;
}

/** Lê o vault e, se não houver erro, grava o módulo gerado. */
export async function gerar(vault, saida) {
  const res = await readVault(vault);
  if (res.errors.length === 0) {
    await mkdir(dirname(saida), { recursive: true });
    await writeFile(saida, modulo(res), 'utf8');
  }
  return res;
}
