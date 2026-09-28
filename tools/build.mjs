/**
 * Vault → src/data/caderno.gen.js
 *
 *   node tools/build.mjs            gera uma vez
 *   node tools/build.mjs --watch    regera a cada alteração no vault
 *   node tools/build.mjs --fix      grava slugs ausentes nos .md, depois gera
 *   node tools/build.mjs --strict   avisos também falham (útil no CI)
 *
 * Para escrever pelo próprio caderno, use `node tools/serve.mjs`: ele já
 * gera, serve e regera sozinho a cada nota salva.
 *
 * O arquivo gerado NÃO vai para o git: é derivado, e versionar derivado só
 * produz diff barulhento e risco de fonte e cópia divergirem. O CI regera.
 */

import { readFile, writeFile, watch } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gerar, resumo } from './lib/gerar.mjs';
import { readVault } from './lib/vault.mjs';
import { setKey } from './lib/frontmatter.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const arg = (nome, padrao) => {
  const i = process.argv.indexOf(nome);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
};

const VAULT = resolve(raiz, arg('--vault', 'vault'));
const SAIDA = resolve(raiz, arg('--out', 'src/data/caderno.gen.js'));

const tty = process.stdout.isTTY;
const cor = {
  r: (s) => (tty ? `\x1b[31m${s}\x1b[0m` : s),
  a: (s) => (tty ? `\x1b[33m${s}\x1b[0m` : s),
  v: (s) => (tty ? `\x1b[32m${s}\x1b[0m` : s),
  d: (s) => (tty ? `\x1b[2m${s}\x1b[0m` : s)
};

async function fixarSlugs() {
  const { notes } = await readVault(VAULT);
  let n = 0;
  for (const nota of notes) {
    if (nota.slugGravado || !nota.arquivo || nota.arquivo.endsWith('/')) continue;
    const caminho = join(VAULT, nota.arquivo);
    await writeFile(caminho, setKey(await readFile(caminho, 'utf8'), 'slug', nota.slug), 'utf8');
    n++;
  }
  if (n) console.log(cor.v(`--fix: slug gravado em ${n} nota(s).`));
}

async function build({ silencioso = false } = {}) {
  const t0 = performance.now();
  if (args.has('--fix')) await fixarSlugs();

  const strict = args.has('--strict');
  const res = await readVault(VAULT);
  for (const e of res.errors) console.error(cor.r('erro  ') + e);
  if (!silencioso || res.errors.length) for (const w of res.warnings) console.warn(cor.a('aviso ') + w);

  if (res.errors.length || (strict && res.warnings.length)) {
    console.error(cor.r(`\nbuild falhou: ${res.errors.length} erro(s), ${res.warnings.length} aviso(s). Nada foi gravado.`));
    return false;
  }

  await gerar(VAULT, SAIDA);
  const m = resumo(res);
  console.log(
    cor.v('ok ') +
    `${m.notas} notas · ${m.arestas} arestas · ${m.escritas} escritas · ` +
    Object.entries(m.porStatus).map(([k, v]) => `${k} ${v}`).join(' · ') +
    cor.d(` (${(performance.now() - t0).toFixed(0)} ms)`)
  );
  return true;
}

const ok = await build();

if (args.has('--watch')) {
  console.log(cor.d(`\nobservando ${VAULT} — Ctrl+C para sair`));
  let timer = null;
  try {
    for await (const ev of watch(VAULT, { recursive: true })) {
      if (!ev.filename || /(^|[\\/])\./.test(ev.filename)) continue;
      clearTimeout(timer);
      timer = setTimeout(() => build({ silencioso: true }).catch((e) => console.error(e)), 180);
    }
  } catch (e) {
    console.error(cor.r(`--watch indisponível aqui (${e.code || e.message}).`));
    process.exitCode = 1;
  }
} else if (!ok) {
  process.exitCode = 1;
}
