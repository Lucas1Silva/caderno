# Caderno

Um caderno pessoal desenhado como grafo de rede vivo. Cada nó é uma nota em
Markdown dentro de `vault/`; o caderno lê e escreve nesses arquivos.

> Voltando ao projeto depois de um tempo, ou pensando em Python? Comece pelo
> [GUIA.md](GUIA.md): o projeto explicado do zero, com cada peça traduzida para Python.

Nasce de um nó central, os demais se abrem por simulação de forças e
continuam respirando depois do equilíbrio. Cada nó é uma nota; clicar abre
o texto num painel lateral.

---

## Rodando

Precisa de **Node 20+**. Nada mais.

```bash
node tools/serve.mjs
```

Abra <http://localhost:5173>. Clique num nó → **Editar** → escreva → **Ctrl+S**.

Para um assunto novo, clique no nó onde ele se encaixa → **+ Novo tópico**. Na
raiz, o botão vira **+ Novo domínio**. O nó nasce ao lado do pai e a nota abre
direto para escrever.

Esse comando gera os dados, serve o site e grava o que você escreve direto no
`.md` dentro de `vault/`. Se você editar um `.md` por fora (VS Code, bloco de
notas), ele percebe e regera sozinho — é só recarregar o navegador.

Para levar as notas ao GitHub, o de sempre:

```bash
git add vault && git commit -m "notas" && git push
```

### Onde dá para escrever, e onde não

| | ler | escrever |
|---|---|---|
| `node tools/serve.mjs` na sua máquina | sim | **sim** |
| site publicado no GitHub Pages | sim | não |

No Pages não existe servidor para receber o texto, então os botões *Editar* e
*+ Novo* nem aparecem. Escrever pelo site publicado exigiria um token do GitHub no
navegador — decisão separada, não tomada.

### Segurança do servidor local

Ele grava no seu disco, então: escuta só em `127.0.0.1` (ninguém na rede
alcança), recusa pedido cujo `Host` não seja localhost (barra *DNS rebinding*),
só grava em nota que já existe no grafo, identificada por slug, e nunca por
caminho vindo do navegador. E não envia cabeçalho CORS.

### Arquivo único, só leitura

```bash
npm run bundle                # gera dist/caderno.html
```

---

## As notas

Cada nota é um `.md` em `vault/`. O editor do caderno grava nesses arquivos;
qualquer outro editor de texto também serve.

```
vault/
├── Caderno.md                   ← a raiz (e o manual)
├── Engenharia de IA/
│   ├── Engenharia de IA.md      ← nota-de-pasta: o próprio domínio
│   ├── Agentes/
│   │   ├── Agentes.md           ← nota-de-pasta: a sub-área
│   │   ├── MCP.md
│   │   └── ...
├── Arquitetura/ ...
├── _raw/                        ← material bruto (ignorado pelo build)
└── _templates/Nota.md           ← template para nota nova
```

**A pasta é a hierarquia. O frontmatter é o estado. O `[[link]]` é a aresta.**

```yaml
---
slug: mcp                 # endereço estável: #/mcp. Nunca mude depois de publicado
status: vazio             # vazio | rascunho | estudado | reproduzido
relacionados:             # arestas, para quando ainda não há texto
  - "[[Tools]]"
---
Aqui você escreve. Qualquer [[link]] no texto também vira aresta.
```

### As regras, e por que cada uma existe

- **A nota de uma pasta tem o nome da pasta** — `Agentes/Agentes.md`, não
  `index.md`. Links resolvem pelo nome do arquivo; com `index.md`,
  `[[Agentes]]` não teria para onde apontar.
- **Prefixo `_` ou `.` é ignorado.** Lugar do `_raw/`, `_templates/` e
  `.obsidian/`.
- **`slug` é gravado, não derivado.** Renomear a nota não quebra link externo.
  Nota sem slug gera aviso; `node tools/build.mjs --fix` grava uma vez.
- **Nome de arquivo é único no vault inteiro.** É por ele que `[[link]]`
  encontra a nota. Repetido é erro de build.
- **Link dentro de código ou de `%% comentário %%` não é aresta.** É exemplo.
- **`matiz: [ini, fim]` só vale na nota de um domínio.** Domínio sem matiz
  recebe um arco livre automaticamente, com aviso.
- **`titulo:`** sobrescreve o nome exibido quando o nome do arquivo não pode
  ter o caractere — `/` é proibido em nome de arquivo, então
  `Percentis (p50, p95, p99).md` exibe `Percentis (p50/p95/p99)`.

### Criar notas

Pelo caderno, com o servidor local rodando: clique num nó → **+ Novo tópico**
(ou **+ Novo domínio**, na raiz). O servidor:

- valida o nome — nada de `/ : * ? " < > |` (o Windows proíbe), nem `[ ] # ^`
  (quebrariam os `[[links]]`), nem `_` ou `.` no começo (seria ignorado);
- recusa nome repetido, porque é pelo nome que os links encontram a nota;
- grava o slug no frontmatter, com sufixo se já existir (`mcp-2`);
- num **domínio novo**, escolhe sozinho um arco de cor livre;
- num **tópico sem filhos**, transforma o tópico em pasta antes:
  `Sub/API.md` passa a `Sub/API/API.md`, com o mesmo texto e o mesmo slug.
  Nenhum link quebra, porque links resolvem pelo nome, não pelo caminho;
- se o caderno não conseguir ler o vault depois da criação, desfaz tudo.

Renomear e apagar ainda são feitos à mão, nos arquivos: renomear quebraria os
`[[links]]` que apontam para a nota, e isso precisa de um cuidado próprio.

### Novo domínio à mão

Crie a pasta e a nota-de-pasta com `matiz`. Nada mais — nem CSS, nem JS.

```yaml
---
slug: python
status: vazio
ordem: 3
matiz: [110, 165]
---
```

Arcos em uso: 22–95 (Engenharia de IA), 185–255 (Arquitetura).
Livres: 110–165 (verde), 275–330 (violeta), 340–20 (magenta → coral).

### Os quatro estados

| status | no grafo | significa |
|---|---|---|
| `vazio` | oco: anel colorido, miolo quase transparente | só o assunto existe |
| `rascunho` | meio preenchido | anotações soltas |
| `estudado` | sólido | você entende e consegue explicar |
| `reproduzido` | sólido, com anel duplo | você implementou do zero |

Só tópicos têm estado. Raiz, domínios e sub-áreas são estrutura.

O contador no canto mostra quantos tópicos saíram de `vazio`. É o número
honesto: se os nós crescerem e ele não, o caderno virou brinquedo.

### Markdown suportado

Títulos, ênfase (`**`, `*`, `~~`, `==`), código em linha e em bloco, listas
aninhadas, tarefas `- [ ]`, citações, callouts (`> [!warning]`),
tabelas, links, wikilinks (`[[Nota]]`, `[[Nota|apelido]]`, `[[Nota#seção]]`),
linha horizontal e comentários `%%`.

**Não suportado ainda:** matemática `$...$` (aparece como texto), notas de
rodapé, HTML embutido (é escapado de propósito). Para matemática o caminho é
KaTeX na hora do build.

---

> O formato é o mesmo do Obsidian — pasta, frontmatter, `[[link]]`. O caderno
> não depende dele, mas se um dia você quiser abrir `vault/` lá, funciona sem
> conversão.

## Estrutura do código

```
tools/
├── serve.mjs              servidor local: serve, grava as notas, regera
├── build.mjs              vault → src/data/caderno.gen.js  (--watch, --fix, --strict)
├── bundle.mjs             tudo num HTML só
├── evolve.mjs             algoritmo genético que evolui a física
├── relatorio.mjs          resultado da evolução → evolucao/relatorio.html
└── lib/
    ├── gerar.mjs          compartilhado por build e serve
    ├── criar.mjs          validação de nome e plano de onde a nota nova nasce
    ├── genetico.mjs       genes, seleção, cruzamento, mutação, elitismo
    ├── aptidao.mjs        a nota de um universo: cinco critérios
    ├── sintetico.mjs      grafo artificial maior, para testar generalização
    ├── vault.mjs          lê pastas, frontmatter, links; valida
    ├── frontmatter.mjs    subconjunto de YAML
    └── markdown.mjs       Markdown → HTML, com wikilinks e callouts
src/
├── main.js                monta as peças, seleção, deep link, laço
├── params.js              o genoma: parâmetros manuais + gerador com semente
├── graph.js               árvore → nós, arestas, constelações
├── physics.js             simulação de forças
├── render.js              canvas; status de estudo por nó
├── panel.js               painel lateral da nota
├── editor.js              edição no painel (só aparece com o servidor local)
├── criador.js             o botão + Novo e o formulário de nota nova
├── viewport.js            câmera e zoom
├── palette.js             cores fixas do CSS + cor de nó gerada em HSL
├── interaction.js         ponteiro, pinch, teclado, clique vs. arrasto
├── data/caderno.gen.js    GERADO — não versionado
└── data/fisica.js         parâmetros evoluídos — versionado (é resultado de experimento)
evolucao/                  histórico, resultado e relatório da última evolução
test/                      node --test
```

`caderno.gen.js` não vai para o git: é derivado do vault, e versionar derivado
só produz diff barulhento e risco de fonte e cópia divergirem. O CI regera.

## Física evoluída

Os oito parâmetros da física — repulsão, rigidez, gravidade, atrito e os
comprimentos das quatro molas — foram evoluídos por um algoritmo genético
escrito do zero, sem biblioteca.

```bash
node tools/evolve.mjs                 # 24 indivíduos × 30 gerações, ~5 min
node tools/evolve.mjs --rapido        # 12 × 10, para ver funcionando
node tools/evolve.mjs --nao-aplicar   # evolui e relata, sem trocar a física do site
node tools/evolve.mjs --aplicar-ultimo
```

O resultado aparece em `evolucao/relatorio.html`. No caderno, o botão no canto
inferior esquerdo troca ao vivo entre a física evoluída e a manual — o universo
se reorganiza na hora.

### Como funciona

- **Genoma:** 8 números entre 0 e 1, traduzidos para as faixas de cada
  parâmetro. Os que atravessam ordens de grandeza usam escala log.
- **Aptidão:** roda a física sem navegador por 40 s simulados e mede
  cruzamentos de arestas, pureza dos domínios, nós colados, se cabe na tela e
  se assenta. Média ponderada, de 0 a 100. Os pesos são opinião minha.
- **Evolução:** torneio de 3, cruzamento por mistura (BLX-α), mutação
  gaussiana que encolhe ao longo das gerações, os 2 melhores passam intactos.

### Treino, validação e teste

A nota é **ruidosa** — o mesmo genoma varia uns 6 pontos só trocando a posição
inicial dos nós — e **caótica**: mudar um parâmetro na sexta casa decimal muda o
layout final. Com um conjunto só de sementes, o GA premia quem teve sorte.
Então:

| etapa | sementes | para quê |
|---|---|---|
| treino | 1 a 5 | guiam a evolução |
| validação | 11 a 20 | escolhem entre os 6 finalistas, já arredondados |
| teste | 101 a 110, e um grafo sintético com 122 nós | o número que se reporta; não participa de nenhuma escolha |

Na primeira rodada, o 1º colocado do treino caiu 5 pontos na validação e o 6º
foi o escolhido. É a maldição do vencedor, e é por isso que a validação existe.

### Correção posterior: a mola impossível (28/09)

A primeira nota de verdade — RAG, ligando quatro tópicos irmãos — fez o nó
Chunking sacudir a 2,74 unidades/frame com a física evoluída. A causa estava
na física desde o início: dois irmãos presos ao mesmo pai por molas L ficam no
máximo a 2L, e a aresta cruzada entre eles pedia mais do que isso. Com os
valores manuais o conflito era pequeno e passava despercebido; o evoluído, com
molas de tópico mais curtas e menos atrito, o expôs. A nota de aptidão não viu
porque avalia a física sem a respiração.

Hoje a aresta entre irmãos repousa em no máximo 1,6·L (`FATOR_IRMAOS` em
`src/graph.js`). Reavaliado com a correção e com a nota nova, o evoluído
continua à frente: **61,1 ± 1,9 contra 49,8 ± 2,3** nas sementes de teste, e
+17,0 no grafo sintético. O relatório em `evolucao/` registra a rodada
original, com a física anterior.

### O que a nota não mede

A evolução avalia a física **sem** a respiração permanente — com ela ligada,
nenhum layout assenta para ser medido. O efeito colateral: com o atrito menor
do vencedor, a respiração ficava 2,5× mais agitada. `physics.js` escala a
respiração pelo atrito, para que a amplitude não dependa de um parâmetro de
layout (com os valores manuais a escala vale exatamente 1).

O enquadramento da câmera também deixou de ser um número fixo: depois que a
expansão assenta, o caderno mede o raio real do grafo e ajusta o zoom. Domínios
novos ou outra física não vazam mais da tela.

## Navegação

- **hover** acende a *constelação* do nó: ele, a subárvore, o caminho até a raiz
  e os vizinhos por aresta cruzada. O resto escurece.
- **clique** abre a nota. Mesmo nó fecha; outro nó troca.
- **`#/slug`** no endereço abre a nota direto — dá para linkar de fora. O botão
  voltar do navegador funciona.
- links dentro da nota e as conexões no rodapé navegam o grafo.
- `Esc` fecha. Setas, `+`, `-`, `0` movem a câmera.

## Testes

```bash
node --test
```

Cobre o parser de frontmatter, o renderizador de Markdown (escape de HTML,
bloqueio de `javascript:`), a leitura do vault com fixtures, o servidor local
(frontmatter preservado ao salvar, recusa de Host estranho e de caminho fora do
projeto, gravações simultâneas), arestas que nascem e morrem com a física
rodando, o desenho com um canvas falso que lança onde o Chrome lança, e o
algoritmo genético: operadores, reprodutibilidade por semente, uma função com
ótimo conhecido, as métricas de aptidão em grafos montados à mão, e a física
evoluída respirando como a manual.

Toda simulação nos testes usa gerador com semente. Antes, com `Math.random`,
o teste de convergência falhava de vez em quando.

---

## Stack e custo

| Camada | Escolha |
|---|---|
| Notas | Markdown em `vault/` |
| Servidor local | Node 20+, `node:http`, sem dependências |
| Renderização | Canvas 2D |
| Painel | DOM + CSS |
| Linguagem | JavaScript, módulos ES nativos |
| Tipografia | Newsreader (Google Fonts) |
| CI / hospedagem | GitHub Actions + Pages |

`package.json` existe só pelos scripts e pelo `"type": "module"` — que garante
que o Node trate `src/*.js` como módulo ES em qualquer versão. **Zero
dependências.**

**Custo zero**, com duas ressalvas:

1. **Pages em repositório privado exige plano pago.** No Free, publicar exige
   repo público. Se o caderno tiver notas que não devem ser públicas:
   Cloudflare Pages ou Netlify aceitam repo privado no plano gratuito.
2. **Actions em repo privado consome cota** (2.000 min/mês no Free). Este
   workflow gasta menos de um minuto por push.

## Licença

MIT
