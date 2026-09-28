/**
 * Grafo sintético parecido com o caderno real, em qualquer tamanho.
 *
 * Existe para uma pergunta só: os parâmetros evoluídos no grafo de 77 nós
 * continuam bons quando o caderno crescer? Se piorarem num grafo que a
 * evolução nunca viu, é overfitting — os parâmetros decoraram o grafo de
 * treino em vez de aprender a organizar grafos parecidos com ele.
 *
 * As proporções copiam o caderno real: ~6 sub-áreas por domínio, ~4-5
 * tópicos por sub-área, ~0,75 aresta cruzada por nó, ~20% delas ligando
 * domínios diferentes.
 */

const ARCOS = [[22, 95], [185, 255], [110, 165], [275, 330], [340, 380], [0, 20]];

export function gerarCaderno({ dominios = 4, rng }) {
  const inteiro = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const topicosPorDominio = [];

  const tree = {
    label: 'Caderno',
    children: Array.from({ length: dominios }, (_, d) => {
      const topicos = [];
      topicosPorDominio.push(topicos);
      return {
        label: `D${d + 1}`,
        hue: ARCOS[d % ARCOS.length],
        children: Array.from({ length: inteiro(5, 7) }, (_, s) => ({
          label: `D${d + 1}.S${s + 1}`,
          children: Array.from({ length: inteiro(3, 6) }, (_, t) => {
            const nome = `D${d + 1}.S${s + 1}.T${t + 1}`;
            topicos.push(nome);
            return nome;
          })
        }))
      };
    })
  };

  const todos = topicosPorDominio.flat();
  const nNos = 1 + dominios + tree.children.reduce((s, d) => s + d.children.length, 0) + todos.length;
  const cross = [];
  const visto = new Set();
  const alvo = Math.round(nNos * 0.75);
  while (cross.length < alvo) {
    const entre = rng() < 0.2;
    const da = inteiro(0, dominios - 1);
    const db = entre ? (da + inteiro(1, dominios - 1)) % dominios : da;
    const a = topicosPorDominio[da][inteiro(0, topicosPorDominio[da].length - 1)];
    const b = topicosPorDominio[db][inteiro(0, topicosPorDominio[db].length - 1)];
    const k = [a, b].sort().join('|');
    if (a === b || visto.has(k)) continue;
    visto.add(k);
    cross.push([a, b]);
  }
  return { tree, cross, nNos };
}
