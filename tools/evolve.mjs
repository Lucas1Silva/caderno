/**
 * Evolui os parâmetros da física com um algoritmo genético.
 *
 *   node tools/evolve.mjs                  24 indivíduos × 30 gerações (alguns minutos)
 *   node tools/evolve.mjs --rapido         12 × 10, para ver funcionando
 *   node tools/evolve.mjs --nao-aplicar    evolui e relata, mas não troca a física do site
 *   node tools/evolve.mjs --aplicar-ultimo aplica o vencedor de evolucao/resultado.json, sem evoluir
 *
 *   --populacao N   --geracoes N   --semente N (do próprio GA; mesma semente, mesma evolução)
 *
 * Grava:
 *   evolucao/historico.csv    melhor, média, pior e diversidade por geração
 *   evolucao/resultado.json   parâmetros, notas, validação e retratos do universo
 *   evolucao/relatorio.html   tudo isso desenhado (via tools/relatorio.mjs)
 *   src/data/fisica.js        os parâmetros vencedores, que o site passa a usar
 *
 * Treino, validação e teste — como em qualquer ML:
 *
 *   treino     a evolução só enxerga as sementes 1 a 5
 *   validação  os 6 finalistas são arredondados e reavaliados em 10 sementes
 *              que a evolução nunca viu; o melhor ali é o escolhido
 *   teste      o escolhido é medido em outras 10 sementes e num grafo
 *              sintético maior; ESSE é o número que se reporta
 *
 * Por que três conjuntos: a nota é ruidosa (o mesmo genoma varia ~6 pontos
 * só trocando a semente) e caótica (mexer na 6ª casa decimal muda o layout).
 * Com um conjunto só, o GA premia quem teve sorte nas sementes de treino —
 * a "maldição do vencedor". A validação corta essa sorte; o teste mede o
 * que sobrou sem ter sido usado para escolher nada.
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readVault } from './lib/vault.mjs';
import { avaliar, simular, PESOS, ESCALAS, LIMIAR_PERTO, FAIXA_RAIO, PASSOS } from './lib/aptidao.mjs';
import { evoluir, decodificar, codificar, GENES } from './lib/genetico.mjs';
import { gerarCaderno } from './lib/sintetico.mjs';
import { PARAMS_MANUAIS, mulberry32 } from '../src/params.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const tem = (f) => args.includes(f);
const num = (f, padrao) => {
  const i = args.indexOf(f);
  return i !== -1 && Number.isFinite(Number(args[i + 1])) ? Number(args[i + 1]) : padrao;
};

const RAPIDO = tem('--rapido');
const POP = num('--populacao', RAPIDO ? 12 : 24);
const GER = num('--geracoes', RAPIDO ? 10 : 30);
const SEMENTE_GA = num('--semente', 2026);
const TREINO = [1, 2, 3, 4, 5];
const VALIDACAO = Array.from({ length: 10 }, (_, i) => 11 + i);
const TESTE = Array.from({ length: 10 }, (_, i) => 101 + i);
const FINALISTAS = 6;
const SINTETICO = [201, 202, 203, 204, 205];

const tty = process.stdout.isTTY;
const cinza = (s) => (tty ? `\x1b[2m${s}\x1b[0m` : s);
const verde = (s) => (tty ? `\x1b[32m${s}\x1b[0m` : s);

/**
 * Arredonda para 4 dígitos significativos — legível num arquivo. Como a nota
 * é caótica, o arredondado é outro ponto da vizinhança, com outra nota; por
 * isso os finalistas são arredondados ANTES da validação. O que vai para o
 * site é exatamente o que foi validado e testado.
 */
function arredondar(p) {
  const out = { ...PARAMS_MANUAIS };
  for (const g of GENES) out[g.nome] = Number(p[g.nome].toPrecision(4));
  return out;
}

/** Posições assentadas de um universo, para desenhar no relatório. */
function retrato(tree, cross, params, semente) {
  const g = simular(tree, cross, params, semente);
  const r = (v) => Math.round(v * 10) / 10;
  return {
    nos: g.nodes.map((n) => [r(n.x), r(n.y), n.depth, n.h === null ? null : Math.round(n.h), Number(n.shade.toFixed(2))]),
    rotulos: g.nodes.map((n) => (n.depth <= 1 ? n.label : null)),
    arestas: g.links.map((l) => [l.a.id, l.b.id, l.cruzada ? 1 : 0])
  };
}

const resumir = (av) => ({
  aptidao: Number(av.aptidao.toFixed(2)),
  erro: Number(av.erro.toFixed(2)),
  partes: Object.fromEntries(Object.entries(av.partes).map(([k, v]) => [k, Number(v.toFixed(3))])),
  medidas: Object.fromEntries(Object.entries(av.medidas).map(([k, v]) => [k, Number(v.toFixed(3))])),
  porSemente: av.porSemente.map((s) => Number(s.aptidao.toFixed(2)))
});

/** Grava src/data/fisica.js a partir de um resultado. O site passa a usar esses valores. */
async function aplicar(res) {
  const params = { ...PARAMS_MANUAIS };
  for (const g of res.genes) params[g.nome] = g.evoluido;
  const js =
`// GERADO por tools/evolve.mjs a partir da evolução de ${res.data}. Versionado de
// propósito: é resultado de experimento, não algo derivado do vault — rodar de novo
// leva minutos e, com outra semente, dá outro número. Relatório: evolucao/relatorio.html
//
// O caderno usa estes valores; abra com ?fisica=manual para comparar com os
// ajustados à mão (src/params.js).

export const PARAMS_EVOLUIDOS = ${JSON.stringify(params, null, 2)};

export const EVOLUCAO = ${JSON.stringify({
    data: res.data,
    geracoes: res.configuracao.geracoes,
    populacao: res.configuracao.populacao,
    manual: Number(res.teste.manual.aptidao.toFixed(1)),
    evoluido: Number(res.teste.evoluido.aptidao.toFixed(1)),
    erro: Number(res.teste.evoluido.erro.toFixed(1))
  })};
`;
  await writeFile(join(RAIZ, 'src/data/fisica.js'), js, 'utf8');
}

if (tem('--aplicar-ultimo')) {
  const res = JSON.parse(await readFile(join(RAIZ, 'evolucao/resultado.json'), 'utf8'));
  await aplicar(res);
  console.log(`src/data/fisica.js ← vencedor de ${res.data} (teste: ${res.teste.evoluido.aptidao.toFixed(1)} contra ${res.teste.manual.aptidao.toFixed(1)} do manual)`);
  process.exit(0);
}

// ---------------------------------------------------------------------

const t0 = performance.now();
const { tree, cross, errors } = await readVault(join(RAIZ, 'vault'));
if (errors.length) {
  console.error('o vault tem erros; rode node tools/build.mjs para ver quais.');
  process.exit(1);
}

console.log(`\nevoluindo a física do caderno`);
console.log(cinza(`${POP} indivíduos × ${GER} gerações · ${GENES.length} genes · sementes de treino ${TREINO.join(', ')} · ${PASSOS / 60} s simulados por universo\n`));

const manualTreino = avaliar(tree, cross, PARAMS_MANUAIS, TREINO);
console.log(`parâmetros manuais: ${manualTreino.aptidao.toFixed(1)} ± ${manualTreino.erro.toFixed(1)}  ${cinza('(a linha de base a bater)')}\n`);
console.log(cinza(' ger   melhor   média    pior   diversidade   avaliações   tempo'));

const campeoesPorGeracao = [];
const { populacao, historico } = evoluir(
  (genoma) => avaliar(tree, cross, decodificar(genoma), TREINO),
  {
    populacao: POP,
    geracoes: GER,
    rng: mulberry32(SEMENTE_GA),
    aoTerminarGeracao(h) {
      campeoesPorGeracao.push(h.campeao.genoma);
      const s = ((performance.now() - t0) / 1000).toFixed(0);
      const bate = h.melhor > manualTreino.aptidao ? verde(' ▲') : '';
      console.log(
        `${String(h.geracao).padStart(4)}   ${h.melhor.toFixed(1).padStart(6)}  ${h.media.toFixed(1).padStart(6)}  ${h.pior.toFixed(1).padStart(6)}` +
        `        ${h.diversidade.toFixed(3)}        ${String(h.avaliacoes).padStart(5)}   ${s.padStart(4)} s${bate}`
      );
    }
  }
);

// ---- validação: escolhe entre os finalistas em sementes que o GA nunca viu ----

console.log(cinza(`\nvalidação: ${FINALISTAS} finalistas em ${VALIDACAO.length} sementes novas`));
const vistos = new Set();
const finalistas = [];
for (const ind of populacao) {
  const p = arredondar(decodificar(ind.genoma));
  const k = JSON.stringify(p);
  if (vistos.has(k)) continue;
  vistos.add(k);
  const val = avaliar(tree, cross, p, VALIDACAO);
  finalistas.push({ params: p, treino: ind.aptidao, validacao: val.aptidao, erro: val.erro });
  console.log(`  treino ${ind.aptidao.toFixed(1).padStart(5)}  →  validação ${val.aptidao.toFixed(1).padStart(5)} ± ${val.erro.toFixed(1)}`);
  if (finalistas.length === FINALISTAS) break;
}
finalistas.sort((a, b) => b.validacao - a.validacao);
const vencedor = finalistas[0].params;

// ---- teste: nada daqui foi usado para escolher ----

console.log(cinza('\nteste: sementes e grafo que não participaram de nenhuma escolha'));
const evoluidoTreino = avaliar(tree, cross, vencedor, TREINO);
const manualTeste = avaliar(tree, cross, PARAMS_MANUAIS, TESTE);
const evoluidoTeste = avaliar(tree, cross, vencedor, TESTE);

const sint = gerarCaderno({ dominios: 4, rng: mulberry32(77) });
const manualSint = avaliar(sint.tree, sint.cross, PARAMS_MANUAIS, SINTETICO);
const evoluidoSint = avaliar(sint.tree, sint.cross, vencedor, SINTETICO);

const linha = (nome, m, e) => {
  const d = e.aptidao - m.aptidao;
  const f = (x) => `${x.aptidao.toFixed(1).padStart(5)} ± ${x.erro.toFixed(1)}`;
  console.log(`  ${nome.padEnd(30)} manual ${f(m)}   evoluído ${f(e)}   ${(d >= 0 ? '+' : '') + d.toFixed(1)}`);
};
linha(`treino (${TREINO.length} sementes)`, manualTreino, evoluidoTreino);
linha(`teste (10 sementes novas)`, manualTeste, evoluidoTeste);
linha(`grafo sintético (${sint.nNos} nós)`, manualSint, evoluidoSint);

// ---- retratos: o melhor universo em alguns pontos da evolução ----

const marcos = [...new Set([0, Math.round((GER - 1) / 3), Math.round((2 * (GER - 1)) / 3), GER - 1])];
const SEMENTE_RETRATO = TESTE[0];
// Retratos na mesma semente de teste, para comparar universos com o mesmo
// ponto de partida: o campeão de treino em cada marco, o manual e o escolhido.
const retratos = {
  semente: SEMENTE_RETRATO,
  manual: retrato(tree, cross, PARAMS_MANUAIS, SEMENTE_RETRATO),
  vencedor: retrato(tree, cross, vencedor, SEMENTE_RETRATO),
  geracoes: marcos.map((g) => ({
    geracao: g,
    aptidao: Number(historico[g].melhor.toFixed(2)),
    ...retrato(tree, cross, decodificar(campeoesPorGeracao[g]), SEMENTE_RETRATO)
  }))
};

// ---- gravação ----

const dirEvo = join(RAIZ, 'evolucao');
await mkdir(dirEvo, { recursive: true });

const csv = ['geracao,melhor,media,pior,diversidade,avaliacoes']
  .concat(historico.map((h) => [h.geracao, h.melhor.toFixed(3), h.media.toFixed(3), h.pior.toFixed(3), h.diversidade.toFixed(4), h.avaliacoes].join(',')))
  .join('\n') + '\n';
await writeFile(join(dirEvo, 'historico.csv'), csv, 'utf8');

const data = new Date().toISOString().slice(0, 10);
const resultado = {
  data,
  configuracao: {
    populacao: POP, geracoes: GER, sementeGA: SEMENTE_GA, passos: PASSOS,
    sementesTreino: TREINO, sementesValidacao: VALIDACAO, sementesTeste: TESTE, sementesSintetico: SINTETICO,
    elite: 2, torneio: 3
  },
  genes: GENES.map((g, i) => ({
    ...g,
    manual: PARAMS_MANUAIS[g.nome],
    evoluido: vencedor[g.nome],
    posicaoManual: Number(codificar(PARAMS_MANUAIS)[i].toFixed(3)),
    posicaoEvoluida: Number(codificar(vencedor)[i].toFixed(3))
  })),
  aptidao: { pesos: PESOS, escalas: ESCALAS, limiarPerto: LIMIAR_PERTO, faixaRaio: FAIXA_RAIO },
  treino: { manual: resumir(manualTreino), evoluido: resumir(evoluidoTreino) },
  finalistas: finalistas.map((f) => ({
    treino: Number(f.treino.toFixed(2)),
    validacao: Number(f.validacao.toFixed(2)),
    erro: Number(f.erro.toFixed(2)),
    escolhido: f.params === vencedor
  })),
  teste: { manual: resumir(manualTeste), evoluido: resumir(evoluidoTeste) },
  sintetico: { nos: sint.nNos, arestasCruzadas: sint.cross.length, manual: resumir(manualSint), evoluido: resumir(evoluidoSint) },
  historico: historico.map((h) => ({
    geracao: h.geracao,
    melhor: Number(h.melhor.toFixed(3)),
    media: Number(h.media.toFixed(3)),
    pior: Number(h.pior.toFixed(3)),
    diversidade: Number(h.diversidade.toFixed(4))
  })),
  retratos,
  segundos: Math.round((performance.now() - t0) / 1000)
};
await writeFile(join(dirEvo, 'resultado.json'), JSON.stringify(resultado) + '\n', 'utf8');

if (!tem('--nao-aplicar')) await aplicar(resultado);

try {
  const { gerarRelatorio } = await import('./relatorio.mjs');
  await gerarRelatorio(resultado, join(dirEvo, 'relatorio.html'));
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}

console.log(`\n${verde('pronto')} em ${resultado.segundos} s`);
console.log(cinza(`  evolucao/relatorio.html  ·  evolucao/historico.csv  ·  evolucao/resultado.json`));
if (!tem('--nao-aplicar')) console.log(cinza(`  src/data/fisica.js atualizado — o caderno já usa a física evoluída`));
