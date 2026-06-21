# Refatoração do Sistema de Comentários

Review completa do sistema de comentários e highlights do Atlas, com bugs identificados, problemas arquiteturais e sugestões de melhoria priorizadas.

---

## Arquitetura atual

Os comentários são armazenados **inline no markdown** como `==texto==<!--c:nota|cor-->`. Três camadas cooperam:

- `src/components/editor/live_preview.ts` — decora o editor (esconde marcas, pinta o highlight, esconde o `<!--c:-->`)
- `src/components/editor/editor_pane.tsx` — extrai a lista de comentários do doc e faz CRUD via refs
- `src/components/editor/comment_popup.tsx` + `src/components/chat/chat_panel.tsx` — UI de criar/editar e lista lateral
- `src/components/app_shell.tsx` — coordena estado (`comments`, `commentIndex`)

O design é razoável (Obsidian-like, portável, diff-friendly), mas há vários pontos fráceis concretos.

---

## Bugs de corrupção de dados (prioridade alta)

### 1. Comentários com `-->` quebram o documento
`editor_pane.tsx:409` insere direto: `<!--c:${comment}${colorSuffix}-->`. Se o usuário digitar `veja referência --> lá`, o HTML comment fecha cedo e o markdown fica inválido. **Falta escape** do conteúdo.

### 2. Quebra de linha no comentário quebra o parser
`live_preview.ts:312` usa `/^<!--c:(.+?)-->/` onde `.` não casa `\n`. Mas o `CommentPopup` permite Enter para nova linha (`comment_popup.tsx:96`). Comentário multi-linha → nunca mais é parseado → vira lixo visível.

### 3. Highlight com `=` não é reconhecido
Regex `==([^=]+)==` (`editor_pane.tsx:133`, `live_preview.ts:279`) proíbe `=` no conteúdo. Texto técnico como `==a=b==` ou `==key=value==` não funciona.

### 4. `parseCommentAnnotation` é ambíguo
`types/index.ts:204-212` trata qualquer sufixo `|[a-z]+` como cor. Comentário `"revisar|segunda"` → `segunda` vira cor (inválida) e o texto do comentário vira só `"revisar"`. Deveria validar contra o set efetivo em `HIGHLIGHT_COLORS`.

### 5. Identidade frágil → deletar/editar errado
`deleteCommentRef`/`updateCommentRef` (`editor_pane.tsx:152-210`) usam `new RegExp(==${escText}==)` que casa a **primeira** ocorrência. Se houver dois highlights com o mesmo texto (comum), você deleta o errado. Não existe ID estável.

### 6. Índice da lista ≠ índice do doc
A barra lateral usa `index` do array extraído do `liveDoc`. Se o usuário edita o doc entre a seleção e o clique em deletar, o índice aponta para outro comentário. Sem ID, não há como garantir correspondência.

---

## Problemas arquiteturais

### 7. Lógica de parsing duplicada 5x
A combinação `==...==` + lookahead `<!--c:...-->` aparece em:
- `editor_pane.tsx:130-144` (useMemo `comments`)
- `editor_pane.tsx:156-167` (`deleteCommentRef`)
- `editor_pane.tsx:187-195` (`updateCommentRef`)
- `editor_pane.tsx:425-427` (`commitEdit`)
- `editor_pane.tsx:448-450` (`deleteFromEdit`)
- `live_preview.ts:295-328` (`decorateHighlightsAndComments`)
- `live_preview.ts:356-362` (`findCommentAt`)

Qualquer mudança de formato exige tocar 7 lugares. **Extrair para um módulo** `comment_parser.ts` com `findComments(doc): CommentEntry[]` e `serialize(text, comment, color)` resolveria de uma vez.

### 8. Identidade sem ID estável
Sugestão: evoluir o formato para incluir ID:
```
==texto==<!--c:id=abc|comentário|cor-->
```
Isso resolve bugs 5 e 6, permite multi-comentário por highlight no futuro, e facilita sincronizar sidebar ↔ editor.

### 9. `onCommentsChange` dispara em todo keystroke
`editor_pane.tsx:147-149` roda quando a referência de `comments` muda — ou seja, **toda tecla**. Sem diff, o AppShell re-renderiza sem necessidade. Comparar por snapshot serializado (texto+cor+pos aproximada) antes de subir.

### 10. Dois passes sobre o doc por keystroke
`live_preview.ts` já varre o doc para decorar. O `useMemo` em `editor_pane.tsx` varre de novo. Para vaults grandes isso é perceptível. Idealmente o plugin do CodeMirror emitiria a lista de comentários via `StateField`, e o React só lê.

---

## UX

### 11. Clicar num card da sidebar não rola o editor até o highlight
`onCommentIndexChange` só seta o índice — não faz `view.scrollIntoView` nem seleciona. Padrão esperado em editores com comentários (Word, Google Docs, Obsidian Comments).

### 12. Sem atalho de teclado para criar comentário
Só via menu de contexto. `Ctrl+Alt+C` ou similar aceleraria muito.

### 13. Sem estado "resolvido"
Sistemas de comentário maduros têm `resolved/done`. Hoje só existe excluir. Uma cor neutra (cinza já existe) + checkbox no card resolveria.

### 14. Sem timestamp / autor
`relativeTime` já existe em `chat_panel.tsx:12-23` mas não é usado nos cards de comentário. Para vaults compartilhadas isso fica essencial.

### 15. Highlights sem comentário poluem a lista
`addHighlightWithColor` (`editor_pane.tsx:551-563`) cria `<!--c:|cor-->` com texto vazio, que aparece como "(sem comentário)" na sidebar. Ou filtra esses da lista, ou mostra como categoria distinta ("Apenas destaque").

### 16. `findCommentAt` exportado mas aparentemente sem uso
`live_preview.ts:356` — verificar se é dead code.

---

## Pequenas melhorias

### 17. Constantes de popup não casam com altura real
`comment_popup.tsx:15-16` usa `POPUP_HEIGHT = 280` fixo, mas a altura varia com o número de quebras do color picker e do `line-clamp-3` do header. Medir com `ref.getBoundingClientRect()` para clamp preciso.

### 18. Acessibilidade
Color picker (`comment_popup.tsx:104-115`) é `<button>` sem `aria-label`/`aria-pressed`. Sem navegação por teclado entre cores. Popups sem `role="dialog"`.

### 19. Sem testes para o parser
`parseCommentAnnotation` e a extração de comentários são lógica crítica com casos limite (escape, multi-linha, duplicate text, `-->` no conteúdo). Vale cobertura mínima com Vitest.

---

## Priorização sugerida

| Ordem | Item | Razão |
|---|---|---|
| 1 | #1 escape de `-->` + #2 multi-linha | Corrompem o arquivo do usuário |
| 3 | #7 extrair parser num módulo | Destrava todas as outras mudanças |
| 4 | #5/#6/#8 introduzir ID estável no formato | Resolve deletar/editar errado |
| 5 | #11 scroll do editor ao clicar no card | UX de baixo custo |
| 6 | #4 validar cor contra o set real | Bug silencioso |
| 7 | #13 estado "resolvido" + #14 timestamp | Valor de produto |

---

## Próximo passo sugerido

Começar pelo módulo `comment_parser.ts` unificado + escape seguro, que já resolve #1, #2, #7 e prepara o terreno para #8 (ID estável).
