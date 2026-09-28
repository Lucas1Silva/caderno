/**
 * Algoritmo genético, do zero.
 *
 * Um indivíduo é um vetor de números entre 0 e 1 — um por gene. A
 * tradução para o valor físico (repulsão 1500, mola 400…) acontece só na
 * hora de avaliar. Trabalhar no espaço [0, 1] deixa cruzamento e mutação
 * iguais para todos os genes, por mais diferentes que sejam as escalas.
 *
 * Operadores:
 *   seleção     torneio de 3: sorteia três, o melhor vira pai
 *   cruzamento  mistura (BLX-α): cada gene do filho cai num ponto entre os
 *               dos pais, com uma folga de α para cada lado — assim o filho
 *               pode sair um pouco da faixa dos pais e explorar
 *   mutação     ruído gaussiano, com desvio que encolhe ao longo das
 *               gerações: explora no começo, refina no fim
 *   elitismo    os 2 melhores passam intactos, então a melhor nota nunca piora
 */

/**
 * Os genes. `log: true` quando a faixa atravessa ordens de grandeza: aí o
 * meio do intervalo [0, 1] cai na média geométrica, não na aritmética, e a
 * busca não passa 90% do tempo na metade de cima.
 */
export const GENES = [
  { nome: 'REPULSION',    min: 600,    max: 3000,  log: true },
  { nome: 'SPRING',       min: 0.002,  max: 0.02,  log: true },
  { nome: 'GRAVITY',      min: 0.0003, max: 0.004, log: true },
  { nome: 'DAMPING',      min: 0.85,   max: 0.96 },
  { nome: 'MOLA_DOMINIO', min: 250,    max: 550 },
  { nome: 'MOLA_SUBAREA', min: 90,     max: 220 },
  { nome: 'MOLA_TOPICO',  min: 50,     max: 120 },
  { nome: 'MOLA_CRUZADA', min: 100,    max: 260 }
];

const limitar = (v) => Math.min(1, Math.max(0, v));

/** Vetor [0, 1]ⁿ → objeto de parâmetros. */
export function decodificar(genoma) {
  const p = {};
  GENES.forEach((g, i) => {
    const t = limitar(genoma[i]);
    p[g.nome] = g.log
      ? Math.exp(Math.log(g.min) + t * (Math.log(g.max) - Math.log(g.min)))
      : g.min + t * (g.max - g.min);
  });
  return p;
}

/** Objeto de parâmetros → vetor [0, 1]ⁿ. Usado para localizar os valores manuais. */
export function codificar(params) {
  return GENES.map((g) => {
    const v = params[g.nome];
    return limitar(g.log
      ? (Math.log(v) - Math.log(g.min)) / (Math.log(g.max) - Math.log(g.min))
      : (v - g.min) / (g.max - g.min));
  });
}

/** Normal padrão por Box-Muller, a partir de um gerador uniforme. */
function gaussiana(rng) {
  const u = 1 - rng(), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function aleatorio(rng) {
  return GENES.map(() => rng());
}

export function torneio(populacao, rng, k = 3) {
  let melhor = null;
  for (let i = 0; i < k; i++) {
    const c = populacao[Math.floor(rng() * populacao.length)];
    if (!melhor || c.aptidao > melhor.aptidao) melhor = c;
  }
  return melhor;
}

export function cruzar(pai, mae, rng, alfa = 0.25) {
  return pai.map((a, i) => {
    const b = mae[i];
    const lo = Math.min(a, b), hi = Math.max(a, b), folga = (hi - lo) * alfa;
    return limitar(lo - folga + rng() * (hi - lo + 2 * folga));
  });
}

export function mutar(genoma, rng, { taxa = 0.25, desvio = 0.12 } = {}) {
  return genoma.map((g) => (rng() < taxa ? limitar(g + gaussiana(rng) * desvio) : g));
}

/** Diversidade da população: desvio padrão médio por gene. Cai quando ela converge. */
export function diversidade(genomas) {
  const n = genomas.length;
  const tam = genomas[0]?.length ?? 0;   // o genoma diz quantos genes tem; GENES pode mudar
  if (!n || !tam) return 0;
  let soma = 0;
  for (let i = 0; i < tam; i++) {
    const m = genomas.reduce((s, g) => s + g[i], 0) / n;
    soma += Math.sqrt(genomas.reduce((s, g) => s + (g[i] - m) ** 2, 0) / n);
  }
  return soma / tam;
}

/**
 * Evolução completa.
 *
 * @param {(genoma: number[]) => {aptidao: number}} avaliar
 * @param {object} opts
 * @param {(info) => void} [opts.aoTerminarGeracao]  para progresso e histórico
 * @returns {{ melhor, populacao, historico }}  população final ordenada, melhor primeiro
 */
export function evoluir(avaliar, {
  populacao: tamanho = 24,
  geracoes = 30,
  elite = 2,
  rng,
  desvioInicial = 0.15,
  desvioFinal = 0.03,
  taxaMutacao = 0.25,
  aoTerminarGeracao
} = {}) {
  const cache = new Map();   // genoma → avaliação: elite e repetidos não recalculam
  const chave = (g) => g.map((x) => x.toFixed(6)).join(',');
  const nota = (genoma) => {
    const k = chave(genoma);
    if (!cache.has(k)) cache.set(k, avaliar(genoma));
    return { genoma, ...cache.get(k) };
  };

  let pop = Array.from({ length: tamanho }, () => nota(aleatorio(rng)));
  const historico = [];

  for (let ger = 0; ger < geracoes; ger++) {
    pop.sort((a, b) => b.aptidao - a.aptidao);
    const aptidoes = pop.map((p) => p.aptidao);
    const info = {
      geracao: ger,
      melhor: aptidoes[0],
      media: aptidoes.reduce((s, x) => s + x, 0) / aptidoes.length,
      pior: aptidoes[aptidoes.length - 1],
      diversidade: diversidade(pop.map((p) => p.genoma)),
      campeao: pop[0],
      avaliacoes: cache.size
    };
    historico.push(info);
    aoTerminarGeracao?.(info);
    if (ger === geracoes - 1) break;

    // o desvio encolhe linearmente: explorar no começo, refinar no fim
    const desvio = desvioInicial + (desvioFinal - desvioInicial) * (ger / Math.max(1, geracoes - 2));
    const proxima = pop.slice(0, elite);
    while (proxima.length < tamanho) {
      const filho = mutar(cruzar(torneio(pop, rng).genoma, torneio(pop, rng).genoma, rng), rng, {
        taxa: taxaMutacao,
        desvio
      });
      proxima.push(nota(filho));
    }
    pop = proxima;
  }

  pop.sort((a, b) => b.aptidao - a.aptidao);
  return { melhor: pop[0], populacao: pop, historico };
}
