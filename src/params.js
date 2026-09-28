/**
 * Parâmetros da física — o genoma do universo.
 *
 * Os oito primeiros são os GENES: é o que o algoritmo genético
 * (tools/evolve.mjs) ajusta. Os três últimos são limites de segurança e
 * coreografia, fora da evolução de propósito: mexer neles não deixa o
 * layout melhor, só muda o quanto ele pode explodir.
 *
 * PARAMS_MANUAIS são os valores que eu ajustei à mão ao longo da conversa,
 * olhando a tela. Ficam aqui como linha de base: é contra eles que o
 * resultado evoluído é comparado.
 */
export const PARAMS_MANUAIS = {
  // ---- forças ----
  REPULSION: 1500,     // empurrão entre todos os pares
  SPRING: 0.0075,      // rigidez das arestas
  GRAVITY: 0.0013,     // atração ao centro
  DAMPING: 0.90,       // fração da velocidade que sobrevive a cada frame

  // ---- comprimento de repouso das molas ----
  MOLA_DOMINIO: 400,   // raiz → domínio
  MOLA_SUBAREA: 155,   // domínio → sub-área
  MOLA_TOPICO: 82,     // sub-área → tópico (níveis abaixo usam 80% disso)
  MOLA_CRUZADA: 175,   // arestas entre ramos, vindas de [[links]]

  // ---- fora da evolução ----
  CUTOFF: 520,         // além disso, a repulsão é ignorada
  MAXV: 9,             // teto de velocidade
  EXPANSION_MS: 2600   // duração do sopro inicial
};

/**
 * Gerador pseudoaleatório com semente (mulberry32).
 *
 * Sem semente, cada carga da página nasce de posições diferentes — ótimo
 * para o visual, péssimo para comparar parâmetros: o mesmo genoma tiraria
 * notas diferentes só por sorte. Com semente, a mesma semente reproduz o
 * mesmo universo, nó por nó.
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
