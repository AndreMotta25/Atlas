---
name: intentional-design
description: Use esta skill sempre que for construir um site, landing page, ou qualquer interface web. Ela garante que cada decisão de design seja intencional — não um default aceito sem questionamento. Aplica princípios de hierarquia visual, identidade autoral, tipografia, paleta, interações e estrutura de componentes para evitar outputs genéricos. Trigger obrigatório antes de escrever qualquer código de interface.
---

Esta skill guia a construção de interfaces web com decisões intencionais em cada camada — layout, tipografia, cor, interação e textura. O objetivo não é "não parecer IA", mas garantir que cada escolha tenha um motivo articulável.

**Princípio central:** Se você não consegue justificar uma decisão em uma frase, você não decidiu — aceitou um default.

---

## Passo 0 — Antes de tocar em qualquer componente

Responda estas três perguntas. Sem elas, qualquer decisão visual é decoração:

1. **Qual é o único objetivo dessa página?** Se você listou dois, escolha um.
2. **Quem é o usuário e o que ele já sabe quando chega?** Isso define tom, densidade e hierarquia.
3. **O que ele precisa sentir — não só ver?** Urgência, confiança, curiosidade, alívio. Escolha um.

As respostas informam todas as decisões que vêm depois: cor, tipografia, hierarquia, copy, interação.

---

## Distinção obrigatória: Princípios vs. Restrições Criativas

Não confunda os dois tipos de regra nesta skill:

**Princípios** — valem sempre, sem exceção:

- Hierarquia visual precisa existir e ser óbvia
- Toda decisão precisa ser intencional e justificável
- Identidade visual vem do produto, não do template

**Restrições criativas** — forçam saída do default, mas não são leis universais:

- Não use gradiente roxo como fundo principal
- Não coloque dois botões com peso igual no hero
- Não use fonte padrão sem ajuste consciente

Violar uma restrição criativa com motivo claro é design. Violar um princípio é erro.

---

## Navbar

**Evite:** Logo à esquerda + links no centro + CTA à direita. Simetria de 3 colunas é o padrão mais aceito sem questionamento.

**Faça:**

- Logo à esquerda + CTA único à direita (sem links no centro)
- Ou logo centralizado com links abaixo
- Ou só logo + hambúrguer, sem links expostos no desktop
- Se usar backdrop-blur, adicione borda sutil na base

**Regra de bolso:** Links expostos no desktop raramente são necessários em landing pages. Mais de 3 links visíveis é adição, não decisão.

---

## Hero

**Evite:** Título centralizado + subtítulo + dois botões lado a lado + imagem abaixo.

**Faça:**

- Título alinhado à esquerda
- Um botão com peso total — o secundário vira link sutil ou some
- Hierarquia tipográfica real: uma palavra em destaque (tamanho, cor ou peso diferente)
- Imagem pode vir antes do texto, sobrepor, ou ser o fundo

**Regra de bolso:** Dois botões com o mesmo peso visual significam que você não escolheu o que importa. O problema não é quantidade — é igualdade. Um botão subordinado ao outro é aceitável; dois botões irmãos, não.

---

## Seção de Contexto / Problema

**Evite:** "O Problema" + coluna de texto à esquerda + imagem à direita + copy emocional genérico com viradas narrativas óbvias.

**Faça:**

- Dados reais, números, estatísticas — não emoção sem lastro
- Imagem primeiro, texto depois
- Uma coluna só quando possível
- Tom direto, sem rodeio

**Regra de bolso:** Se o texto começa com "Você sabia que..." ou "Todo mundo sabe que...", reescreva. Dê um fato, não uma opinião disfarçada de verdade universal.

---

## Features

**Evite:** Grid com 3 ou 4 cards idênticos — ícone + título + descrição do mesmo tamanho.

**Faça:**

- Uma feature principal com mais espaço e destaque que as outras
- Alternância de layouts: texto-direita, texto-esquerda, full-width
- Timeline vertical em vez de grid horizontal, quando fizer sentido
- Se tiver 4 features, avalie cortar para 3. Se as 3 parecem iguais, uma não é realmente diferente

**Regra de bolso:** Features não são iguais. Uma é a mais importante — trate ela diferente. Se você não sabe qual é, descubra antes de diagramar.

---

## Paleta de Cores

**Evite:** Gradiente azul + roxo. Branco + cinza claro + roxo. Qualquer combinação escolhida por ser "segura" ou "moderna".

**Faça:**

- No máximo 2 cores fortes (primária + accent)
- Dark de verdade: não preto puro, mas um azul-escuro ou cinza-escuro com personalidade
- Gradiente apenas em áreas pequenas e específicas — nunca no fundo inteiro
- Cores derivadas do produto ou serviço sendo construído

**Regra de bolso:** Olhe o produto. Que cor ele sugere? Que tom combina com o que o usuário deve sentir (resposta do Passo 0)? Parta daí, não de um gerador de paleta.

---

## Tipografia

**Evite:** Fonte padrão do sistema sem escolha consciente. Escala de tamanhos exata de qualquer framework sem ajuste.

**Faça:**

- Uma fonte display marcante para títulos (peso 700+), escolhida intencionalmente
- Fonte de corpo diferente da de título
- Tamanhos ajustados manualmente — os defaults são ponto de partida, não resposta
- Contraste forte entre título e corpo em peso, tamanho e estilo

**Regra de bolso:** Título e corpo precisam ser obviamente diferentes. Se você precisar olhar duas vezes para distinguir um do outro, a tipografia está errada.

---

## Interações

**Evite:** Fade-in no scroll como única animação. É o movimento mais aceito sem questionamento porque está disponível por default em quase toda biblioteca.

**Faça:**

- Pelo menos uma micro-interação que não seja fade-in: escala no hover, borda que muda de cor, reveal com movimento lateral
- Se usar scroll reveal, use easing diferente ou direção inesperada
- Pergunte sempre: essa interação serve o conteúdo ou serve ao designer?

**Regra de bolso:** Se a única animação é "elemento aparece quando rola", você não tem animação — tem template. Se a animação chama mais atenção que o conteúdo, corte.

> Cursor customizado foi removido desta lista intencionalmente. Em 90% dos contextos prejudica usabilidade sem adicionar identidade real.

---

## Textura e Imperfeição

**Evite:** Fundo 100% liso, bordas arredondadas iguais em tudo, grid perfeitamente alinhado sem nenhum elemento "vazando".

**Faça:**

- Ruído sutil no fundo (SVG grain overlay, 0.5–2% opacity)
- Um elemento que vaza fora do grid ou da seção
- Uma borda com ângulo diferente em um componente específico
- Textura de papel, granulado ou scan lines onde fizer sentido

**Regra de bolso:** Design limpo demais é design sem personalidade. A imperfeição precisa ser intencional — não aleatória, não descuido. É a diferença entre caráter e erro.

> Esta é a regra mais negligenciada e uma das que mais impacta a sensação de "alguém fez isso". Merece atenção proporcional ao impacto.

---

## Botões

**Evite:** Todos os botões com o mesmo estilo, border-radius, tamanho relativo.

**Faça:**

- CTA principal com tratamento único: cor sólida vs outline, ausência de ícone quando secundários têm, tamanho ligeiramente maior
- Border-radius variado por contexto — 4px, 8px, 12px dependendo do componente e tom
- Se todo botão tem ícone + texto, pelo menos um não deveria ter

**Regra de bolso:** Se todos os botões parecem iguais, nenhum é importante. O usuário precisa saber instantaneamente qual apertar.

---

## Footer

**Evite:** Logo no centro + 3 colunas de links + redes sociais + copyright. Mesmo background do header.

**Faça:**

- Se não há link útil, sem footer grande — talvez só uma linha
- Background diferente do header (inverter as cores funciona bem)
- Um elemento visual único que não aparece em nenhuma outra seção

**Regra de bolso:** Footer com 3 colunas de links que ninguém clica é mais pesado que útil. Corte até sobrar só o essencial.

---

## Checklist por Seção

Antes de finalizar cada seção, responda:

1. **Isso é a escolha mais óbvia?** Se sim, questione. O óbvio pode ser certo — mas precisa ser escolha, não omissão.
2. **Eu já fiz isso em outra seção?** Se sim, como posso diferenciar?
3. **Eu consigo justificar essa decisão em uma frase?** Se não, refaça.
4. **Um ser humano olharia e diria "alguém pensou nisso"?** Se hesitar, refaça.

---

## Os 3 Mandamentos

Não por serem os únicos, mas por serem os mais quebrados:

1. **Nunca dois botões com peso igual no hero**
2. **Nunca fonte padrão sem escolha consciente**
3. **Nunca simetria de 3 colunas no header sem motivo articulável**

Violar qualquer um desses sem justificativa é aceitar um default. O default pode ser a resposta certa — mas você precisa ter chegado lá por escolha.
