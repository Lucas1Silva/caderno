---
slug: rag
status: rascunho
relacionados:
  - "[[Search]]"
---
**RAG** — *Retrieval-Augmented Generation*, geração aumentada por recuperação. Antes de o modelo responder, um sistema busca numa base externa os trechos relevantes para *aquela* pergunta e os coloca no contexto. O modelo responde a partir do que recebeu, e não só do que memorizou no treino.

## Minha versão

Pense numa prova com consulta em que só se pode levar uma folha. O modelo é o aluno; o RAG é quem escolhe qual folha entra na sala. [[Fine-tuning e PEFT]] seria estudar antes da prova, o que muda o aluno. O RAG não muda o aluno: os pesos do modelo continuam os mesmos, e só o que ele vê naquela pergunta é diferente.

Três consequências disso:

- **Atualiza na hora.** Trocou o documento, a resposta muda. Não há treino.
- **Permite citar a fonte.** Dá para mostrar de qual trecho veio a resposta.
- **O teto é a busca.** Se o trecho certo não chega ao contexto, o modelo não tem como acertar — e pode responder com confiança a partir do trecho errado. Por isso quase todo o trabalho de um RAG está na recuperação: [[Chunking]], [[Embeddings]], [[Vector store]], [[Re-rank]].

## O argumento da Chip Huyen

No capítulo 6 de *AI Engineering* (2025), ela compara a construção de contexto para modelos de fundação à *feature engineering* do ML clássico: nos dois casos, o trabalho é entregar ao modelo a informação de que ele precisa para processar a entrada.

E ela discorda de quem acha que contextos longos vão acabar com o RAG, por dois motivos:

1. **Os dados crescem mais rápido que as janelas.** As pessoas acrescentam dados e quase nunca apagam. A janela de contexto cresce depressa, mas não o bastante para qualquer aplicação — sempre haverá uma que não cabe.
2. **Processar contexto longo não é o mesmo que usá-lo bem.** Quanto maior o contexto, maior a chance de o modelo se concentrar na parte errada. E cada token a mais custa dinheiro e pode somar [[Latency]].

O RAG, então, entrega a cada pergunta só o que é relevante: menos tokens de entrada e, potencialmente, um modelo que acerta mais.

> [!nota] Mais contexto não é mais conhecimento
> Um modelo não "sabe mais" por receber mais texto; ele ganha mais lugares onde se perder. A janela de [[Model context]] mede quanto cabe, e não quanto é aproveitado. O estudo *Lost in the Middle* (Liu et al., 2023) mostrou isso na prática: o desempenho cai quando a informação relevante está no meio de um contexto longo, e é melhor quando ela está no começo ou no fim.

## A regra da Anthropic

No post que apresentou o *Contextual Retrieval*, em setembro de 2024, a Anthropic escreveu:

> Se a sua base de conhecimento tem menos de 200 mil tokens (cerca de 500 páginas de material), você pode simplesmente incluir a base inteira no prompt que dá ao modelo, sem precisar de RAG ou métodos parecidos.

Minha leitura:

- **É uma regra de custo, não de qualidade.** A frase vem acompanhada do *prompt caching*, lançado pouco antes: reenviar a mesma base a cada pergunta fica até 90% mais barato e mais de 2× mais rápido. Sem cache, 200 mil tokens em toda pergunta seriam caros e lentos.
- **O número acompanha a janela.** 200 mil tokens era a janela do Claude na época. Janelas maiores empurram o limite para cima, mas não respondem à objeção da Chip: caber não é ser bem usado.
- **As duas visões não brigam.** A regra define a linha de base: abaixo do limite, teste primeiro a base inteira no contexto, e o RAG só entra se provar que responde melhor, mais barato ou mais rápido. Acima do limite, o próprio post mostra como melhorar a recuperação: antes de indexar, cada trecho recebe um resumo curto do documento de onde saiu. Com embeddings e busca lexical (BM25) contextualizados assim, as falhas de recuperação caíram 49%; somando um [[Re-rank]], 67%.

## No próprio caderno

Este caderno é o caso da Anthropic: as notas inteiras cabem num prompt com folga. Por isso ainda não há RAG aqui. Ele passa a fazer sentido quando o caderno crescer além disso, ou quando o custo por pergunta começar a importar.

## Fontes

- Chip Huyen, *AI Engineering: Building Applications with Foundation Models*, O'Reilly, 2025 — [cap. 6, "RAG and Agents"](https://www.oreilly.com/library/view/ai-engineering/9781098166298/ch06.html).
- Anthropic, [Introducing Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval), 19 set. 2024.
- Nelson F. Liu et al., [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172), 2023 (publicado na TACL em 2024).

%% Próxima nota, do mesmo livro: a arquitetura de um RAG. %%
