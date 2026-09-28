import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, wikiTargets, isEmpty } from '../tools/lib/markdown.mjs';

const resolve = (nome) => ({ mcp: { slug: 'mcp' }, tools: { slug: 'tools' } })[nome.toLowerCase()] || null;

test('HTML cru é escapado — nada injeta script', () => {
  const html = render('<script>alert(1)</script> e <b>negrito</b>');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('link com javascript: vira texto', () => {
  const html = render('[clique](javascript:alert(1))');
  assert.ok(!html.includes('href="javascript'));
});

test('wikilink resolvido vira link de navegação; quebrado vira aviso', () => {
  const html = render('Ver [[MCP]], [[Tools|ferramentas]] e [[Inexistente]].', resolve);
  assert.match(html, /<a class="wl" href="#\/mcp" data-slug="mcp">MCP<\/a>/);
  assert.match(html, /data-slug="tools">ferramentas<\/a>/);
  assert.match(html, /wl-missing[^>]*>Inexistente</);
});

test('wikiTargets ignora link em código e comentário — exemplo não é aresta', () => {
  const md = 'real [[MCP]]\n`[[Falso1]]`\n```\n[[Falso2]]\n```\n%% [[Falso3]] %%\n[[pasta/Tools#seção|x]]';
  assert.deepEqual(wikiTargets(md), ['MCP', 'Tools']);
});

test('código em linha protege o conteúdo de ênfase e de link', () => {
  const html = render('use `**nao** [[MCP]]` aqui', resolve);
  assert.match(html, /<code>\*\*nao\*\* \[\[MCP\]\]<\/code>/);
});

test('bloco de código preserva texto e escapa', () => {
  const html = render('```python\nif a < b:\n    print("x")\n```');
  assert.match(html, /<pre class="lang-python">/);
  assert.match(html, /a &lt; b/);
});

test('títulos descem um nível: o h1 do painel é o título da nota', () => {
  assert.match(render('# Um'), /<h2>Um<\/h2>/);
  assert.match(render('## Dois'), /<h3>Dois<\/h3>/);
});

test('listas aninhadas e tarefas', () => {
  const html = render('- a\n  - a1\n  - a2\n- b\n- [x] feito\n- [ ] pendente');
  assert.match(html, /<ul><li>a<ul><li>a1<\/li><li>a2<\/li><\/ul><\/li><li>b<\/li>/);
  assert.match(html, /class="task done"/);
});

test('lista ordenada respeita o número inicial', () => {
  assert.match(render('3. c\n4. d'), /<ol start="3">/);
});

test('tabela GFM com alinhamento', () => {
  const html = render('| a | b |\n|:--|--:|\n| 1 | 2 |');
  assert.match(html, /<th style="text-align:left">a<\/th>/);
  assert.match(html, /<td style="text-align:right">2<\/td>/);
});

test('--- abaixo de frase com | é linha horizontal, não tabela', () => {
  const html = render('a | b\n\n---');
  assert.ok(!html.includes('<table>'));
  assert.match(html, /<hr>/);
});

test('callout do Obsidian', () => {
  const html = render('> [!warning] Cuidado\n> texto');
  assert.match(html, /callout callout-aviso/);
  assert.match(html, /callout-title">Cuidado</);
});

test('snake_case não vira itálico', () => {
  assert.ok(!render('uma_variavel_qualquer').includes('<em>'));
});

test('nota vazia: só espaço ou comentário', () => {
  assert.equal(isEmpty('  \n\n'), true);
  assert.equal(isEmpty('%% rascunho escondido %%\n'), true);
  assert.equal(isEmpty('texto'), false);
});
