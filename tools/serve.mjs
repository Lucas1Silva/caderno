/**
 * Servidor local do caderno: serve o site E grava as notas.
 *
 *   node tools/serve.mjs              http://localhost:5173
 *   node tools/serve.mjs --port 8080
 *
 * Substitui `python -m http.server` + `build --watch`: gera os dados ao
 * subir, serve os arquivos, recebe o texto do painel e grava no .md, e
 * regera quando qualquer nota muda — pelo caderno ou por outro editor.
 *
 * SEGURANÇA — este servidor escreve no seu disco, então:
 *   - escuta só em 127.0.0.1: ninguém na sua rede alcança;
 *   - recusa pedido cujo Host não seja localhost. Isso barra "DNS
 *     rebinding", o truque em que um site malicioso aberto no seu navegador
 *     tenta falar com servidores da sua própria máquina;
 *   - só grava dentro de vault/, e só em nota que já existe no grafo
 *     (identificada por slug, nunca por caminho vindo do navegador);
 *   - não envia cabeçalho CORS: nenhuma outra origem consegue chamar a API.
 *
 * Também resolve de vez o problema de MIME no Windows: os tipos são
 * declarados aqui, não lidos do registro do sistema.
 */

import { createServer } from 'node:http';
import { readFile, writeFile, stat, watch, mkdir, rename, rm, rmdir } from 'node:fs/promises';
import { resolve, dirname, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readVault } from './lib/vault.mjs';
import { gerar, resumo } from './lib/gerar.mjs';
import { parse, setKey, normalize } from './lib/frontmatter.mjs';
import { planejarCriacao } from './lib/criar.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

const STATUS_VALIDOS = new Set(['vazio', 'rascunho', 'estudado', 'reproduzido']);
const LIMITE_CORPO = 2 * 1024 * 1024;

/**
 * Troca o corpo de uma nota preservando o frontmatter como está — ordem das
 * chaves, comentários, campos que o caderno nem conhece. Só `status` é
 * reescrito, e só se vier.
 */
export function montarNota(textoAtual, { corpo, status, slug }) {
  let base = normalize(textoAtual ?? '');
  const fm = parse(base);
  if (!fm.hasFrontmatter) base = `---\nslug: ${slug}\nstatus: vazio\n---\n`;
  if (status) base = setKey(base, 'status', status);
  const linhas = base.split('\n');
  const fim = parse(base).fmEnd;
  const cabecalho = linhas.slice(0, fim).join('\n');
  const texto = String(corpo ?? '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  return `${cabecalho}\n${texto ? texto + '\n' : ''}`;
}

export function criarServidor({ vault = join(RAIZ, 'vault'), saida = join(RAIZ, 'src/data/caderno.gen.js'), raiz = RAIZ, porta = 5173, log = console } = {}) {
  let estado = null;              // último resultado de readVault
  let fila = Promise.resolve();   // serializa escrita+regeração

  const hostsOk = () => new Set([`localhost:${porta}`, `127.0.0.1:${porta}`, `[::1]:${porta}`]);

  async function regerar() {
    estado = await gerar(vault, saida);
    if (estado.errors.length) for (const e of estado.errors) log.error('erro  ' + e);
    return estado;
  }

  const json = (res, code, dados) => {
    res.writeHead(code, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
    res.end(JSON.stringify(dados));
  };

  async function lerCorpo(req) {
    let tam = 0;
    const partes = [];
    for await (const p of req) {
      tam += p.length;
      if (tam > LIMITE_CORPO) throw Object.assign(new Error('nota grande demais'), { status: 413 });
      partes.push(p);
    }
    return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}');
  }

  function acharNota(slug) {
    return estado?.notes.find((n) => n.slug === slug) || null;
  }

  /** Caminho absoluto de um caminho relativo ao vault, recusando qualquer fuga. */
  function noVault(rel) {
    const abs = resolve(vault, rel);
    if (!abs.startsWith(resolve(vault) + sep)) throw Object.assign(new Error('fora do vault'), { status: 400 });
    return abs;
  }

  /** Enfileira uma escrita: uma por vez, e uma falha não trava as próximas. */
  function naFila(trabalho) {
    const tarefa = fila.then(trabalho);
    fila = tarefa.catch(() => {});
    return tarefa;
  }

  /**
   * Cria a nota planejada por planejarCriacao. Se o build reclamar depois,
   * desfaz tudo — arquivo novo e promoção — e devolve o erro: o vault nunca
   * fica num estado que o próprio caderno não consegue ler.
   */
  async function criarNota(pedido) {
    const plano = planejarCriacao(estado, pedido);
    // Erros que o vault já tinha (um nome repetido criado à mão, por exemplo)
    // não são culpa da nota nova e não devem impedi-la.
    const errosAntes = new Set(estado.errors);
    const feito = { arquivo: null, promovido: false, pastaCriada: false };
    const existe = async (abs) => stat(abs).then(() => true, () => false);

    try {
      if (plano.promover) {
        const pastaAbs = noVault(plano.promover.pasta);
        if (await existe(pastaAbs)) {
          throw Object.assign(new Error(`Já existe uma pasta "${plano.promover.pasta}" no vault.`), { status: 409 });
        }
        await mkdir(pastaAbs);
        feito.pastaCriada = true;
        await rename(noVault(plano.promover.de), noVault(plano.promover.para));
        feito.promovido = true;
      }
      const alvo = noVault(plano.arquivo);
      await mkdir(dirname(alvo), { recursive: true });
      await writeFile(alvo, plano.conteudo, { encoding: 'utf8', flag: 'wx' });   // wx: falha se existir
      feito.arquivo = alvo;

      const res = await regerar();
      const novos = res.errors.filter((e) => !errosAntes.has(e));
      if (novos.length) {
        throw Object.assign(new Error(`O caderno recusou a nota nova: ${novos.join('; ')}`), { status: 400 });
      }
      return { plano, estado: res };
    } catch (e) {
      if (feito.arquivo) await rm(feito.arquivo, { force: true });
      if (feito.promovido) await rename(noVault(plano.promover.para), noVault(plano.promover.de));
      if (feito.pastaCriada) await rmdir(noVault(plano.promover.pasta)).catch(() => {});
      if (feito.arquivo || feito.promovido) await regerar();
      if (e.code === 'EEXIST') e.status = 409;
      throw e;
    }
  }

  function caminhoDaNota(nota) {
    // pasta sem nota-de-pasta ainda: a nota nasce dentro dela, com o nome dela
    return noVault(nota.arquivo.endsWith('/') ? `${nota.arquivo}${nota.nome}.md` : nota.arquivo);
  }

  async function api(req, res, url) {
    if (url.pathname === '/api/ping') return json(res, 200, { ok: true, editavel: true });

    if (url.pathname === '/api/nota' && req.method === 'POST') {
      const dados = await lerCorpo(req);
      const { plano, estado: vaultNovo } = await naFila(() => criarNota({ pai: dados.pai, nome: dados.nome }));
      const nova = vaultNovo.notes.find((n) => n.slug === plano.slug);
      log.log(`criado ${plano.arquivo}${plano.promover ? `  (${plano.promover.de} virou pasta)` : ''}`);
      return json(res, 201, {
        ok: true,
        pai: dados.pai,
        nota: {
          slug: nova.slug, label: nova.label, status: nova.status,
          vazio: nova.vazio, html: nova.html, profundidade: nova.profundidade
        },
        arquivo: plano.arquivo,
        promovido: plano.promover ? plano.promover.para : null,
        tree: vaultNovo.tree,
        cross: vaultNovo.cross,
        meta: resumo(vaultNovo)
      });
    }

    if (url.pathname === '/api/nota') {
      const slug = url.searchParams.get('slug') || '';
      const nota = acharNota(slug);
      if (!nota || !nota.arquivo) return json(res, 404, { erro: `nota "${slug}" não existe` });

      if (req.method === 'GET') {
        return json(res, 200, { slug, status: nota.status, corpo: nota.corpo.replace(/^\n+/, '') });
      }

      if (req.method === 'PUT') {
        const dados = await lerCorpo(req);
        if (typeof dados.corpo !== 'string') return json(res, 400, { erro: 'campo "corpo" ausente' });
        if (dados.status !== undefined && !STATUS_VALIDOS.has(dados.status)) {
          return json(res, 400, { erro: `status inválido: ${dados.status}` });
        }

        const resultado = await naFila(async () => {
          // Relê a nota DENTRO da fila: uma criação logo antes pode ter
          // promovido este tópico a pasta, e o caminho antigo não existe mais.
          const atualNota = acharNota(slug);
          if (!atualNota) throw Object.assign(new Error(`nota "${slug}" não existe`), { status: 404 });
          const alvo = caminhoDaNota(atualNota);
          let atual = null;
          try { atual = await readFile(alvo, 'utf8'); } catch { await mkdir(dirname(alvo), { recursive: true }); }
          await writeFile(alvo, montarNota(atual, { corpo: dados.corpo, status: dados.status, slug }), 'utf8');
          return regerar();
        });

        const nova = resultado.notes.find((n) => n.slug === slug);
        const avisos = resultado.warnings.filter((w) => nova && w.startsWith(nova.arquivo));
        log.log(`salvo  ${nova?.arquivo ?? slug}${avisos.length ? `  (${avisos.length} aviso)` : ''}`);
        return json(res, 200, {
          ok: true,
          nota: nova && { slug: nova.slug, status: nova.status, vazio: nova.vazio, html: nova.html },
          cross: resultado.cross,
          meta: resumo(resultado),
          avisos
        });
      }

      return json(res, 405, { erro: 'método não permitido' });
    }

    return json(res, 404, { erro: 'rota inexistente' });
  }

  async function estatico(req, res, url) {
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const abs = resolve(raiz, '.' + rel);
    if (!abs.startsWith(resolve(raiz) + sep) && abs !== resolve(raiz)) {
      res.writeHead(403).end('proibido');
      return;
    }
    try {
      const s = await stat(abs);
      if (!s.isFile()) throw new Error();
      res.writeHead(200, {
        'content-type': MIME[extname(abs).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store'   // em desenvolvimento, sempre a versão do disco
      });
      res.end(await readFile(abs));
    } catch {
      res.writeHead(404, { 'content-type': MIME['.txt'] }).end('não encontrado');
    }
  }

  const server = createServer(async (req, res) => {
    try {
      if (!hostsOk().has(req.headers.host)) {
        res.writeHead(403, { 'content-type': MIME['.txt'] }).end('host não permitido');
        return;
      }
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else await estatico(req, res, url);
    } catch (e) {
      log.error(e);
      if (!res.headersSent) json(res, e.status || 500, { erro: e.message });
    }
  });

  return {
    server,
    regerar,
    async iniciar() {
      await regerar();
      await new Promise((ok, falha) => {
        server.once('error', falha);
        server.listen(porta, '127.0.0.1', ok);
      });
      porta = server.address().port;
      return { porta, estado };
    },
    get porta() { return porta; },
    fechar: () => new Promise((ok) => server.close(ok))
  };
}

// ---- execução direta ----
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--port');
  const porta = i !== -1 ? Number(process.argv[i + 1]) : 5173;
  const s = criarServidor({ porta });

  try {
    const { porta: p, estado } = await s.iniciar();
    const m = resumo(estado);
    console.log(`\n  caderno em  http://localhost:${p}`);
    console.log(`  ${m.notas} notas · ${m.arestas} arestas · ${m.escritas} escritas`);
    console.log(`  Ctrl+C para sair\n`);
  } catch (e) {
    if (e.code === 'EADDRINUSE') console.error(`A porta ${porta} está ocupada. Use: node tools/serve.mjs --port 5174`);
    else console.error(e);
    process.exit(1);
  }

  // edição por fora (VS Code, bloco de notas): regera sozinho
  let timer = null;
  try {
    for await (const ev of watch(join(RAIZ, 'vault'), { recursive: true })) {
      if (!ev.filename || /(^|[\\/])[._]/.test(ev.filename)) continue;
      clearTimeout(timer);
      timer = setTimeout(() => s.regerar().catch((e) => console.error(e)), 200);
    }
  } catch { /* sem watch recursivo nesta plataforma: segue sem */ }
}
