import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, setKey } from '../tools/lib/frontmatter.mjs';

test('escalares, listas em linha e em bloco', () => {
  const { data, body } = parse(`---
slug: mcp
ordem: 3
ativo: true
matiz: [22, 95]
relacionados:
  - "[[Tools]]"
  - '[[API]]'
---
corpo`);
  assert.equal(data.slug, 'mcp');
  assert.equal(data.ordem, 3);
  assert.equal(data.ativo, true);
  assert.deepEqual(data.matiz, [22, 95]);
  assert.deepEqual(data.relacionados, ['[[Tools]]', '[[API]]']);
  assert.equal(body, 'corpo');
});

test('CRLF e BOM do Windows não quebram a leitura', () => {
  const { data, body } = parse('\uFEFF---\r\nslug: x\r\nstatus: vazio\r\n---\r\ntexto\r\n');
  assert.equal(data.slug, 'x');
  assert.equal(data.status, 'vazio');
  assert.equal(body, 'texto\n');
});

test('chave vazia é texto vazio; lista vazia explícita continua lista', () => {
  const { data } = parse('---\nslug:\nrelacionados: []\nslugs:\n  - a\n---\n');
  assert.equal(data.slug, '');
  assert.deepEqual(data.relacionados, []);
  assert.deepEqual(data.slugs, ['a']);   // prefixo em comum com "slug" não confunde
});

test('wikilink sem aspas é texto, não lista YAML', () => {
  const { data } = parse('---\nrel: [[Tools]]\n---\n');
  assert.equal(data.rel, '[[Tools]]');
});

test('comentário só vale fora de aspas', () => {
  const { data } = parse('---\na: valor # comentário\nb: "com # dentro"\n---\n');
  assert.equal(data.a, 'valor');
  assert.equal(data.b, 'com # dentro');
});

test('sem frontmatter, ou nunca fechado, tudo é corpo', () => {
  assert.equal(parse('só texto').hasFrontmatter, false);
  const aberto = parse('---\nslug: x\nnunca fecha');
  assert.equal(aberto.hasFrontmatter, false);
  assert.equal(aberto.body, '---\nslug: x\nnunca fecha');
});

test('setKey substitui, insere e cria sem mexer no resto', () => {
  assert.equal(setKey('---\nslug: velho\nstatus: vazio\n---\nx', 'slug', 'novo'),
               '---\nslug: novo\nstatus: vazio\n---\nx');
  assert.equal(setKey('---\nstatus: vazio\n---\nx', 'slug', 's'),
               '---\nstatus: vazio\nslug: s\n---\nx');
  assert.equal(setKey('corpo', 'slug', 's'), '---\nslug: s\n---\ncorpo');
});
