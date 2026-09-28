/**
 * Gera dist/caderno.html: tudo num arquivo só, para abrir com dois cliques
 * ou publicar em qualquer lugar sem servidor.
 *
 *   node tools/bundle.mjs
 *
 * Não é um bundler de verdade — é uma concatenação na ordem de dependência,
 * removendo os `import`/`export`. Funciona porque o projeto não tem
 * dependência externa nem import dinâmico. Se algum dia tiver, troque isto
 * por esbuild ou Rollup em vez de remendar o script.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ordem de dependência, das folhas para o topo
const ORDEM = [
  'src/data/caderno.gen.js',
  'src/params.js',
  'src/data/fisica.js',
  'src/palette.js',
  'src/viewport.js',
  'src/graph.js',
  'src/physics.js',
  'src/render.js',
  'src/interaction.js',
  'src/panel.js',
  'src/editor.js',
  'src/criador.js',
  'src/main.js'
];

const ler = (p) => readFile(resolve(raiz, p), 'utf8');

try {
  await readFile(resolve(raiz, 'src/data/caderno.gen.js'));
} catch {
  console.error('src/data/caderno.gen.js não existe. Rode antes: node tools/build.mjs');
  process.exit(1);
}

function desmodularizar(src, nome) {
  const linhas = src.split('\n');
  const saida = [];
  let pulandoImport = false;

  for (const linha of linhas) {
    if (pulandoImport) {
      if (/from\s+['"].*['"];?\s*$/.test(linha)) pulandoImport = false;
      continue;
    }
    if (/^\s*import\s/.test(linha)) {
      if (!/from\s+['"].*['"];?\s*$/.test(linha)) pulandoImport = true;
      continue;
    }
    saida.push(linha.replace(/^(\s*)export\s+(?=(function|const|let|class)\s)/, '$1'));
  }
  return `\n/* ===== ${nome} ===== */\n${saida.join('\n')}`;
}

const html = await ler('index.html');
const css = await ler('styles/style.css');

let js = '';
for (const arquivo of ORDEM) js += desmodularizar(await ler(arquivo), arquivo);

const saida = html
  .replace(/\s*<link rel="stylesheet" href="\.\/styles\/style\.css">/, '')
  .replace(
    /\s*<script type="module" src="\.\/src\/main\.js"><\/script>/,
    `\n<script>\n(() => {\n"use strict";\n${js}\n})();\n</script>`
  )
  .replace('</head>', `<style>\n${css}\n</style>\n</head>`);

await mkdir(resolve(raiz, 'dist'), { recursive: true });
await writeFile(resolve(raiz, 'dist/caderno.html'), saida, 'utf8');

const kb = (Buffer.byteLength(saida) / 1024).toFixed(1);
console.log(`dist/caderno.html — ${kb} kB, ${ORDEM.length} módulos`);
