/**
 * Simulação de forças (force-directed).
 *
 * Quatro forças atuam a cada passo:
 *   1. repulsão par a par        — espalha, no formato 1/d² (tipo Coulomb)
 *   2. molas nas arestas         — puxa vizinhos para um comprimento de repouso
 *   3. gravidade fraca ao centro — impede a nuvem de escapar da tela
 *   4. sopro radial que decai    — a "expansão" dos primeiros segundos
 *
 * Depois que isso entra em equilíbrio a imagem pararia. Por isso existem
 * duas perturbações permanentes: uma rotação global quase imperceptível e
 * uma oscilação senoidal por nó, cada um com fase própria.
 *
 * O custo é O(n²) por frame. Com algumas dezenas de nós isso é irrelevante.
 * Se o caderno passar de uns 400 nós, o caminho é Barnes-Hut (quadtree) ou
 * trocar por d3-force, que já resolve isso — está anotado no README.
 */

import { PARAMS_MANUAIS } from './params.js';

// Os valores moram em params.js, junto com os comprimentos de mola: é um
// genoma só, e o algoritmo genético precisa enxergar tudo no mesmo lugar.
export const PARAMS = PARAMS_MANUAIS;

/**
 * @param {object} [opts]
 * @param {boolean} [opts.reduced]  sem rotação nem oscilação (reduced motion,
 *                                  e também o modo de avaliação do GA)
 * @param {object}  [opts.params]   sobrescreve qualquer valor de PARAMS
 * @param {() => number} [opts.rng] gerador aleatório; injetável para reprodutibilidade
 */
export function createSimulation(graph, { reduced = false, params = {}, rng = Math.random } = {}) {
  const P = { ...PARAMS, ...params };
  let CUTOFF2 = P.CUTOFF * P.CUTOFF;

  // A respiração é decoração, e a amplitude dela não deveria depender de um
  // parâmetro de layout. Mas depende: com atrito menor a oscilação acumula
  // mais (a velocidade de regime é proporcional a 1/(1 − DAMPING)). Os
  // parâmetros evoluídos retêm 95% da velocidade por frame contra 90% dos
  // manuais, e o universo respirava 2,5× mais agitado. Esta escala anula
  // isso — com os valores manuais ela vale exatamente 1.
  let escalaRespiracao = (1 - P.DAMPING) / (1 - PARAMS_MANUAIS.DAMPING);
  const { nodes, links, core } = graph;

  /**
   * @param {number} dt      passo normalizado (1 = um frame a 60fps)
   * @param {number} elapsed ms desde o início, controla nascimento e expansão
   */
  function step(dt, elapsed) {
    const expansion = Math.max(0, 1 - elapsed / P.EXPANSION_MS);

    for (const n of nodes) {
      if (elapsed < n.born) continue;
      if (n.alive < 1) n.alive = Math.min(1, (elapsed - n.born) / 900);

      n.vx -= n.x * P.GRAVITY * dt;
      n.vy -= n.y * P.GRAVITY * dt;

      if (expansion > 0 && n.depth > 0) {
        const d = Math.hypot(n.x, n.y) || 1;
        const push = expansion * 0.34 * dt;
        n.vx += (n.x / d) * push;
        n.vy += (n.y / d) * push;
      }

      if (!reduced) {
        const k = escalaRespiracao * dt;
        n.vx += -n.y * 0.000055 * k;
        n.vy += n.x * 0.000055 * k;

        const s = Math.sin(elapsed * 0.00042 * n.drift + n.phase);
        n.vx += Math.cos(n.phase * 3.1) * s * 0.0075 * k;
        n.vy += Math.sin(n.phase * 3.1) * s * 0.0075 * k;
      }
    }

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (elapsed < a.born) continue;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        if (elapsed < b.born) continue;

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 > CUTOFF2) continue;
        if (d2 < 1) { d2 = 1; dx = rng() - 0.5; dy = rng() - 0.5; }

        const d = Math.sqrt(d2);
        const f = (P.REPULSION * a.mass * b.mass) / d2;
        const fx = (dx / d) * f * dt;
        const fy = (dy / d) * f * dt;

        a.vx -= fx / a.mass; a.vy -= fy / a.mass;
        b.vx += fx / b.mass; b.vy += fy / b.mass;
      }
    }

    for (const l of links) {
      const { a, b } = l;
      if (elapsed < a.born || elapsed < b.born) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const f = (d - l.rest) * P.SPRING * dt;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx / a.mass; a.vy += fy / a.mass;
      b.vx -= fx / b.mass; b.vy -= fy / b.mass;
    }

    const damp = Math.pow(P.DAMPING, dt);
    for (const n of nodes) {
      if (elapsed < n.born) continue;
      if (n.pinned) { n.vx = 0; n.vy = 0; continue; }
      n.vx *= damp;
      n.vy *= damp;
      const v = Math.hypot(n.vx, n.vy);
      if (v > P.MAXV) { n.vx = (n.vx / v) * P.MAXV; n.vy = (n.vy / v) * P.MAXV; }
      n.x += n.vx * dt;
      n.y += n.vy * dt;
    }

    // A raiz é âncora: fica na origem, com velocidade zerada.
    //
    // Antes eu só puxava a POSIÇÃO de volta (core.x *= 0.9) e deixava a
    // velocidade acumulando. O resultado era a raiz mantendo ~3px/frame de
    // velocidade presa para sempre, brigando com a correção de posição —
    // enquanto todos os outros nós convergiam para ~0.08. Zerar as duas
    // coisas resolve, e deixa a origem sendo de fato a origem.
    if (!core.pinned) {
      core.x = 0; core.y = 0;
      core.vx = 0; core.vy = 0;
    }
  }

  /** Troca as forças com a simulação rodando (ver graph.setMolas). */
  function setParams(novos) {
    Object.assign(P, PARAMS, novos);
    CUTOFF2 = P.CUTOFF * P.CUTOFF;
    escalaRespiracao = (1 - P.DAMPING) / (1 - PARAMS_MANUAIS.DAMPING);
  }

  return { step, setParams, params: P };
}
