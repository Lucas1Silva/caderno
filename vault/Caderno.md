---
slug: caderno
status: rascunho
---
Este caderno é um **grafo vivo**. Cada nó é uma nota; cada pasta é um ramo; cada `[[link]]` é uma aresta.

> [!dica] Como escrever
> Clique em qualquer nó, depois em **Editar**. Escreva, marque o quanto já estudou e aperte **Ctrl+S**. O texto vai direto para o arquivo `.md` daquela nota, e um `[[link]]` recém-escrito vira aresta na hora.

## Os quatro estados

1. **vazio** — só o assunto existe; o nó aparece oco
2. **rascunho** — algumas anotações soltas
3. **estudado** — você entende e consegue explicar
4. **reproduzido** — você implementou do zero; o nó ganha um anel extra

O contador no canto conta quantos tópicos saíram de *vazio*. É o número que importa.

## O que dá para usar no texto

| Escreva | Para |
|---|---|
| `[[MCP]]` | ligar esta nota à nota MCP |
| `[[MCP\|o protocolo]]` | o mesmo link, com outro texto |
| `## Título` | seção |
| `- item` / `- [ ] tarefa` | lista / tarefa |
| `> [!aviso] Cuidado` | caixa de destaque |
| ` ```python ` | bloco de código |
| `%% nota para mim %%` | comentário que não aparece |

Link dentro de código, como os desta tabela, é só exemplo e não cria aresta.

## Levar para o GitHub

```bash
git add vault
git commit -m "notas"
git push
```

%% comentários entre porcentagens não aparecem no caderno %%
