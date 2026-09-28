// Os comprimentos de repouso das molas vêm de params.js: fazem parte do
// genoma que o algoritmo genético evolui.
import { PARAMS_MANUAIS } from './params.js';

/**
 * Dados declarativos → nós e arestas com estado físico.
 *
 * A travessia é recursiva, então a profundidade é livre: um domínio pode ter
 * sub-áreas com tópicos, ou pendurar tópicos direto. Massa, raio e
 * comprimento de mola são derivados da profundidade, não declarados.
 *
 * A cor é gerada, não escolhida: cada domínio declara um arco do círculo
 * cromático e as sub-áreas se espalham dentro dele. Cada nó sai daqui com
 * `h` (matiz em graus) e `shade` (0..1, posição dentro do arco, usada para
 * modular a luminosidade). A raiz tem `h = null` e usa a cor de núcleo.
 */

// Por profundidade do nó. O contraste de tamanho entre os níveis é
// deliberado e forte: a raiz precisa ler como centro, os domínios como
// continentes, e os tópicos como poeira. Com escalas próximas o grafo vira
// uma massa uniforme e perde hierarquia visual.
const MASSA  = [11, 6, 2.4, 1, 1];
const RAIO   = [22, 14, 7.6, 4.3, 4];

const at = (arr, d) => arr[Math.min(d, arr.length - 1)];

/**
 * Dois irmãos presos ao mesmo pai por molas de comprimento L nunca ficam a
 * mais de 2L um do outro. Uma aresta cruzada entre eles que peça mais do que
 * isso é IMPOSSÍVEL de satisfazer: o nó fica sob tensão permanente, num
 * ponto de equilíbrio quase degenerado, e a respiração o empurra de um lado
 * para o outro. Foi assim que o nó Chunking passou a sacudir quando a nota
 * de RAG ligou quatro irmãos de uma vez.
 *
 * 1,6·L corresponde a um ângulo de ~106° entre os dois, visto do pai: longe
 * o bastante para os rótulos não se tocarem, perto o bastante para a mola
 * poder de fato relaxar.
 */
const FATOR_IRMAOS = 1.6;

/**
 * @param {object} [opts]
 * @param {boolean} [opts.reduced]   encurta o nascimento escalonado
 * @param {object}  [opts.params]    sobrescreve MOLA_* de PARAMS_MANUAIS
 * @param {() => number} [opts.rng]  gerador aleatório; com semente, o mesmo
 *                                   universo nasce igual toda vez
 */
export function buildGraph(raiz, cross, { reduced = false, params = {}, rng = Math.random } = {}) {
  let P = { ...PARAMS_MANUAIS, ...params };
  // pela profundidade DO FILHO: [raiz, domínio, sub-área, tópico, mais fundo]
  const molasDe = (p) => [0, p.MOLA_DOMINIO, p.MOLA_SUBAREA, p.MOLA_TOPICO, p.MOLA_TOPICO * 0.8];
  let MOLA = molasDe(P);
  let MOLA_CRUZADA = P.MOLA_CRUZADA;

  const nodes = [];
  const links = [];
  const byLabel = new Map();
  const bySlug = new Map();

  function addNode(label, depth, h, shade, parent, meta = {}) {
    const n = {
      id: nodes.length,
      label, depth, h, shade,
      slug: meta.slug || null,
      status: meta.status || 'vazio',
      vazio: meta.vazio !== false,
      html: meta.html || '',
      parent: parent ? parent.id : null,
      children: [],
      mass: at(MASSA, depth),
      radius: at(RAIO, depth),
      // nasce colado no pai: a expansão é o que os separa
      x: (parent ? parent.x : 0) + (rng() - 0.5) * 10,
      y: (parent ? parent.y : 0) + (rng() - 0.5) * 10,
      vx: 0, vy: 0,
      born: 0, alive: 0,
      phase: rng() * Math.PI * 2,
      drift: rng() * 0.6 + 0.4,
      deg: 0, pinned: false
    };
    nodes.push(n);
    if (byLabel.has(label)) {
      console.warn(`[caderno] rótulo repetido: "${label}". CROSS vai referenciar apenas o primeiro.`);
    } else {
      byLabel.set(label, n);
    }
    if (n.slug) bySlug.set(n.slug, n);
    if (parent) parent.children.push(n.id);
    return n;
  }

  function addLink(a, b, rest, cruzada = false) {
    links.push({ a, b, rest, cruzada });
    a.deg++;
    b.deg++;
  }

  /** Comprimento de repouso de uma aresta cruzada, respeitando a geometria dos irmãos. */
  function repousoCruzada(a, b) {
    if (a.parent !== null && a.parent === b.parent) {
      return Math.min(MOLA_CRUZADA, FATOR_IRMAOS * at(MOLA, a.depth));
    }
    return MOLA_CRUZADA;
  }

  /**
   * @param spec   string (folha) ou { label, hue?, children? }
   * @param arco   [ini, fim] herdado do domínio, ou null na raiz
   */
  function walk(spec, depth, parent, arco) {
    const isLeaf = typeof spec === 'string';
    const label = isLeaf ? spec : spec.label;
    const kids = isLeaf ? [] : (spec.children || []);

    // um domínio (depth 1) declara o arco; abaixo dele, herda
    const meuArco = (!isLeaf && Array.isArray(spec.hue)) ? spec.hue : arco;

    let h = null, shade = 0.5;
    if (meuArco) {
      if (depth === 1) {
        // o domínio fica no meio do próprio arco
        h = (meuArco[0] + meuArco[1]) / 2;
        shade = 0.5;
      } else {
        // sub-áreas e abaixo recebem do pai (definido logo adiante)
        h = parent.h;
        shade = parent.shade;
      }
    }

    const node = addNode(label, depth, h, shade, parent, isLeaf ? {} : spec);
    if (parent) addLink(parent, node, at(MOLA, depth));

    // distribui os filhos diretos de um domínio ao longo do arco
    const espalhar = (depth === 1 && meuArco);
    const n = kids.length;

    kids.forEach((kid, i) => {
      const filho = walk(kid, depth + 1, node, meuArco);
      if (espalhar) {
        const t = n > 1 ? i / (n - 1) : 0.5;
        const hueFilho = meuArco[0] + (meuArco[1] - meuArco[0]) * t;
        // propaga para a subárvore inteira: a sub-área tinge seus tópicos
        tingir(filho, hueFilho, t);
      }
    });

    return node;
  }

  function tingir(node, h, shade) {
    node.h = h;
    node.shade = shade;
    for (const id of node.children) tingir(nodes[id], h, shade);
  }

  const core = walk(raiz, 0, null, null);

  // CROSS aceita slug (o que o build gera) ou rótulo (dados escritos à mão)
  const achar = (k) => bySlug.get(k) || byLabel.get(k);
  for (const [a, b] of cross) {
    const na = achar(a);
    const nb = achar(b);
    if (na && nb && na !== nb) addLink(na, nb, repousoCruzada(na, nb), true);
    else if (!na || !nb) {
      console.warn(`[caderno] CROSS ignorado: ["${a}", "${b}"] — rótulo não encontrado.`);
    }
  }

  // ---- vizinhança e parentesco, pré-computados para o destaque ----

  const neighbors = nodes.map(() => new Set());   // só arestas diretas
  for (const l of links) {
    neighbors[l.a.id].add(l.b.id);
    neighbors[l.b.id].add(l.a.id);
  }

  const descendants = nodes.map(() => new Set());
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    for (const c of n.children) {
      descendants[i].add(c);
      for (const d of descendants[c]) descendants[i].add(d);
    }
  }

  const ancestors = nodes.map(() => new Set());
  for (const n of nodes) {
    let p = n.parent;
    while (p !== null) { ancestors[n.id].add(p); p = nodes[p].parent; }
  }

  /**
   * A "constelação" de um nó: ele, tudo que pende dele, o caminho até a raiz
   * e os vizinhos por aresta cruzada. É o conjunto que acende no hover.
   */
  const constellation = nodes.map((n) => {
    const s = new Set([n.id]);
    for (const d of descendants[n.id]) s.add(d);
    for (const a of ancestors[n.id]) s.add(a);
    for (const v of neighbors[n.id]) s.add(v);
    return s;
  });

  const path = nodes.map((n) => {
    const out = [];
    let p = n.parent;
    while (p !== null) { out.unshift(nodes[p].label); p = nodes[p].parent; }
    return out;
  });

  // ---- nascimento escalonado: é isso que produz a expansão ----
  let ordem = 0;
  (function agendar(id) {
    const n = nodes[id];
    n.born = n.depth === 0 ? 0 : 260 * n.depth + ordem * 34;
    ordem++;
    for (const c of n.children) agendar(c);
  })(core.id);

  if (reduced) for (const n of nodes) n.born *= 0.18;
  const lastBorn = nodes.reduce((m, n) => Math.max(m, n.born), 0);

  /**
   * Reconcilia as arestas cruzadas com uma lista nova, sem reconstruir o
   * grafo. É o que faz um [[link]] recém-escrito virar aresta na hora, com o
   * nó já em movimento — a física só passa a ter uma mola a mais.
   *
   * Só as arestas cruzadas mudam; as de parentesco vêm das pastas. A
   * constelação usa vizinhos diretos, então basta atualizar as duas pontas.
   *
   * @param {Array<[string, string]>} pares  pares de slug
   * @returns {{ adicionadas: number, removidas: number }}
   */
  function syncCross(pares) {
    const chave = (a, b) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
    const alvo = new Map();
    for (const [a, b] of pares) {
      const na = bySlug.get(a), nb = bySlug.get(b);
      if (na && nb && na !== nb) alvo.set(chave(na.slug, nb.slug), [na, nb]);
    }

    let removidas = 0;
    for (let i = links.length - 1; i >= 0; i--) {
      const l = links[i];
      if (!l.cruzada) continue;
      const k = chave(l.a.slug, l.b.slug);
      if (alvo.has(k)) { alvo.delete(k); continue; }   // já existe: nada a fazer
      links.splice(i, 1);
      l.a.deg--; l.b.deg--;
      neighbors[l.a.id].delete(l.b.id); neighbors[l.b.id].delete(l.a.id);
      constellation[l.a.id].delete(l.b.id); constellation[l.b.id].delete(l.a.id);
      // se era também ancestral/descendente, a constelação precisa continuar tendo
      for (const [x, y] of [[l.a, l.b], [l.b, l.a]]) {
        if (ancestors[x.id].has(y.id) || descendants[x.id].has(y.id)) constellation[x.id].add(y.id);
      }
      removidas++;
    }

    for (const [na, nb] of alvo.values()) {
      addLink(na, nb, repousoCruzada(na, nb), true);
      neighbors[na.id].add(nb.id); neighbors[nb.id].add(na.id);
      constellation[na.id].add(nb.id); constellation[nb.id].add(na.id);
    }

    return { adicionadas: alvo.size, removidas };
  }

  /**
   * Troca os comprimentos de repouso das molas com o grafo em movimento. É
   * o que permite alternar entre a física manual e a evoluída sem recarregar:
   * as molas mudam e o universo se reorganiza sozinho.
   */
  function setMolas(params) {
    P = { ...PARAMS_MANUAIS, ...params };
    MOLA = molasDe(P);
    MOLA_CRUZADA = P.MOLA_CRUZADA;
    for (const l of links) l.rest = l.cruzada ? repousoCruzada(l.a, l.b) : at(MOLA, l.b.depth);
  }

  return {
    syncCross,
    setMolas,
    nodes, links, core, byLabel, bySlug,
    neighbors, descendants, ancestors, constellation, path,
    lastBorn,
    maxDepth: nodes.reduce((m, n) => Math.max(m, n.depth), 0)
  };
}
