---
name: canvas-particle-text
description: "Use esta skill sempre que o usuário quiser criar texto formado por partículas animadas usando a Canvas API nativa do browser — sem bibliotecas externas. Trigger: 'particle text', 'texto de partículas', 'text to particles', 'canvas text animation', 'texto que se move', 'partículas que formam texto', 'texto interativo com mouse', ou qualquer efeito onde letras se dissolvem/reformam como pontos. Também use quando o usuário quiser animações de texto baseadas em canvas com interação de mouse, efeitos de convergência/scatter de partículas, ou quando pedir algo como 'quero que o título seja feito de partículas'."
---

# Canvas Particle Text Animation

Efeito onde um texto é renderizado como milhares de partículas que:
- **Entram** espalhadas e convergem para formar as letras (scatter → form)
- **Reagem ao mouse** se afastando do cursor (repulsão)
- **Flutuam sutilmente** após se formarem, dando vida ao texto
- **Funcionam sem bibliotecas** — Canvas API nativa + requestAnimationFrame

---

## Quando usar

| Cenário | Apropriado? |
|---------|------------|
| Hero de landing page com título impactante | Sim |
| Seção de produto com nome em destaque | Sim |
| Qualquer texto que precise de efeito "wow" visual | Sim |
| Textos longos ou parágrafos | Não — use só em títulos curtos |
| Mobile com performance limitada | Reduza `gap` e `particleSize` |

---

## Arquitetura

### Fluxo de renderização

```
1. Canvas opera em 1:1 pixel ratio (sem DPR scaling) — evita bug de duplicação
2. Renderizar texto no canvas com ctx.fillText()
3. Medir texto com ctx.measureText() e encolher se ultrapassar 85% da largura
4. Ler pixels com ctx.getImageData()
5. Criar partículas nas posições onde alpha > 128
6. Animar com requestAnimationFrame:
   - Entrada: interpolar da posição espalhada → posição alvo (ease-out)
   - Interação: repulsão por distância do mouse + spring de retorno
   - Idle: flutuação sutil com sin/cos
7. Limpar e redesenhar a cada frame
```

> **Bug conhecido evitado**: NÃO usar `ctx.scale(dpr, dpr)` — ele acumula entre `initParticles` e o loop `animate`, causando duplicação do texto. O canvas 1:1 elimina esse problema sem perda visual perceptível em partículas.

### Estrutura do componente

| Parte | Responsabilidade |
|-------|-----------------|
| `initParticles()` | Renderiza texto off-screen, amostra pixels, cria array de partículas |
| `animate()` | Loop principal — calcula física, desenha no canvas |
| `handleMouseMove/Leave` | Atualiza posição do mouse para repulsão |
| `handleResize` | Re-inicializa partículas quando o container muda de tamanho |

---

## Código do componente

Criar em `src/components/ui/ParticleText.tsx`:

```typescript
"use client";

import { useEffect, useRef, useCallback } from "react";

interface Particle {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  originX: number;
  originY: number;
  size: number;
  alpha: number;
  vx: number;
  vy: number;
  delay: number;
  color: string;
}

interface ParticleTextProps {
  /** Texto a ser renderizado como partículas */
  text: string;
  /** Classes CSS do container */
  className?: string;
  /** Cor das partículas — qualquer valor CSS válido (hex, rgba, etc.) */
  particleColor?: string;
  /** Diâmetro de cada partícula em px (default: 2) */
  particleSize?: number;
  /** Espaçamento entre amostras de pixel — menor = mais partículas (default: 4) */
  gap?: number;
  /** Raio de repulsão do mouse em px (default: 80) */
  mouseRadius?: number;
}

export function ParticleText({
  text,
  className = "",
  particleColor = "rgba(255, 255, 255, 0.9)",
  particleSize = 2,
  gap = 4,
  mouseRadius = 80,
}: ParticleTextProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  const initParticles = useCallback(
    (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();

      // 1:1 pixel ratio — sem DPR scaling, evita acúmulo de transformação
      canvas.width = rect.width;
      canvas.height = rect.height;

      ctx.clearRect(0, 0, rect.width, rect.height);

      let fontSize = Math.min(rect.width * 0.2, rect.height * 0.3, 160);
      ctx.font = `700 ${fontSize}px "Oswald", sans-serif`;

      // Encolhe fonte se texto ultrapassar o canvas
      const measured = ctx.measureText(text);
      if (measured.width > rect.width * 0.85) {
        fontSize *= (rect.width * 0.85) / measured.width;
        ctx.font = `700 ${fontSize}px "Oswald", sans-serif`;
      }

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "white";
      ctx.fillText(text, rect.width / 2, rect.height / 2);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const particles: Particle[] = [];

      for (let y = 0; y < canvas.height; y += gap) {
        for (let x = 0; x < canvas.width; x += gap) {
          const index = (y * canvas.width + x) * 4;
          if (data[index + 3] > 128) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * 300 + 150;
            particles.push({
              x: x + Math.cos(angle) * distance,
              y: y + Math.sin(angle) * distance,
              targetX: x,
              targetY: y,
              originX: x,
              originY: y,
              size: particleSize * (0.6 + Math.random() * 0.8),
              alpha: 0,
              vx: 0,
              vy: 0,
              delay: Math.random() * 800,
              color: particleColor,
            });
          }
        }
      }

      ctx.clearRect(0, 0, rect.width, rect.height);
      particlesRef.current = particles;
      startTimeRef.current = performance.now();
    },
    [text, particleColor, particleSize, gap]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    initParticles(canvas);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const handleMouseLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };

    const handleResize = () => {
      initParticles(canvas);
    };

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const animate = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      const elapsed = now - startTimeRef.current;

      ctx.clearRect(0, 0, rect.width, rect.height);

      const particles = particlesRef.current;
      const mouse = mouseRef.current;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const progress = Math.max(0, Math.min(1, (elapsed - p.delay) / 1200));
        const ease = 1 - Math.pow(1 - progress, 3);

        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < mouseRadius && dist > 0) {
          const force = (mouseRadius - dist) / mouseRadius;
          p.vx += ((dx / dist) * force * 25) * 0.08;
          p.vy += ((dy / dist) * force * 25) * 0.08;
        }

        p.vx += (p.targetX - p.x) * 0.04;
        p.vy += (p.targetY - p.y) * 0.04;
        p.vx *= 0.88;
        p.vy *= 0.88;
        p.x += p.vx;
        p.y += p.vy;

        if (progress < 1) {
          const scatterX = p.originX + Math.cos(p.delay) * 300;
          const scatterY = p.originY + Math.sin(p.delay) * 300;
          p.x = scatterX + (p.targetX - scatterX) * ease;
          p.y = scatterY + (p.targetY - scatterY) * ease;
        }

        if (progress >= 1) {
          p.x += Math.sin(now * 0.001 + i * 0.1) * 0.5;
          p.y += Math.cos(now * 0.0008 + i * 0.15) * 0.5;
        }

        p.alpha = ease;
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("resize", handleResize);
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [initParticles, mouseRadius]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
      }}
      aria-label={text}
      role="img"
    />
  );
}
```

> **Nota importante sobre DPR**: Este componente opera em 1:1 pixel ratio (sem `devicePixelRatio` scaling). Isso evita o bug de duplicação de texto causado pelo acúmulo de `ctx.scale(dpr, dpr)` entre `initParticles` e o loop de animação. Para partículas, a diferença visual entre 1:1 e DPR-scaled é imperceptível.

---

## Uso em componentes

### Básico — título watermark no Hero

```tsx
import { ParticleText } from "@/components/ui/ParticleText";

<div className="absolute top-[15%] inset-x-0 -z-10 flex items-center justify-center pointer-events-none select-none h-[40vh] md:h-[50vh]">
  <ParticleText
    text="HydroSync"
    className="w-full h-full"
    particleColor="rgba(255, 255, 255, 0.9)"
    particleSize={2}
    gap={4}
    mouseRadius={100}
  />
</div>
```

### Variações de uso

```tsx
{/* Texto escuro sobre fundo claro */}
<ParticleText
  text="NEXUS"
  particleColor="rgba(0, 0, 0, 0.8)"
  particleSize={1.5}
  gap={3}
/>

{/* Partículas coloridas com gradiente simulado via múltiplas cores */}
<ParticleText
  text="AURORA"
  particleColor="rgba(0, 180, 255, 0.85)"
  particleSize={2.5}
  gap={5}
  mouseRadius={120}
/>

{/* Texto grande e denso — mais partículas */}
<ParticleText
  text="IMPACT"
  particleColor="rgba(255, 255, 255, 0.95)"
  particleSize={1.5}
  gap={3}
  mouseRadius={60}
/>
```

---

## Props

| Prop | Tipo | Default | Descrição |
|------|------|---------|-----------|
| `text` | `string` | — | **Obrigatório.** Texto a renderizar como partículas |
| `className` | `string` | `""` | Classes CSS do canvas |
| `particleColor` | `string` | `"rgba(255,255,255,0.9)"` | Cor de cada partícula |
| `particleSize` | `number` | `2` | Diâmetro base em px (varia com random) |
| `gap` | `number` | `4` | Espaçamento da amostragem. Menor = mais denso = mais pesado |
| `mouseRadius` | `number` | `80` | Raio de repulsão do cursor em px |

---

## Customização avançada

### Mudar a fonte do texto

No `initParticles`, altere a linha `ctx.font`:

```typescript
// Padrão
ctx.font = `700 ${fontSize}px "Oswald", sans-serif`;

// Outras opções
ctx.font = `900 ${fontSize}px "Inter", sans-serif`;
ctx.font = `400 ${fontSize}px "JetBrains Mono", monospace`;
```

> A fonte precisa estar carregada antes do canvas renderizar. Se estiver usando `next/font`, a variável CSS já garante isso.

### Mudar a easing de entrada

No `animate`, altere a fórmula de `ease`:

```typescript
// Ease-out cúbico (padrão) — suave
const ease = 1 - Math.pow(1 - progress, 3);

// Ease-out quintic — mais suave ainda
const ease = 1 - Math.pow(1 - progress, 5);

// Ease-out bounce — elástico
const ease = progress < 1
  ? 1 - Math.pow(2, -10 * progress) * Math.cos((progress * 10 * Math.PI) / 3)
  : 1;

// Linear — sem suavização
const ease = progress;
```

### Mudar o comportamento do mouse

```typescript
// Repulsão mais forte
const pushX = (dx / dist) * force * 40; // era 25

// Atração em vez de repulsão — inverter sinal
const pushX = -(dx / dist) * force * 25;

// Aumentar a velocidade de retorno (spring mais rígido)
p.vx += (p.targetX - p.x) * 0.08; // era 0.04
```

### Mudar a flutuação idle

```typescript
// Mais intensa
const floatX = Math.sin(now * 0.002 + i * 0.1) * 2; // era 0.5

// Ondulação horizontal apenas
const floatX = Math.sin(now * 0.001 + i * 0.05) * 1.5;
const floatY = 0;
```

---

## Performance

### Regras para manter 60fps

| Parâmetro | Leve (< 2000 partículas) | Médio | Pesado (> 8000) |
|-----------|--------------------------|-------|-----------------|
| `gap` | 6-8 | 4-5 | 2-3 |
| `particleSize` | 2-3 | 1.5-2 | 1-1.5 |
| Texto | 1 palavra | 1-2 palavras | Só em desktop potente |

### Otimizações já aplicadas

- `willReadFrequently: true` no `getContext()` — hint para o browser otimizar leitura de pixels
- **Sem DPR scaling** — opera 1:1, evita bug de duplicação por acúmulo de `ctx.scale()`
- Damping de velocidade (0.88) — evita oscilação infinita
- Cleanup completo no `useEffect` return — evita memory leak
- Font size com medição (`measureText`) — texto nunca transborda o canvas

### Otimizações adicionais se necessário

```typescript
// Skip frames em devices lentos — desenhar a cada 2 frames
let frameCount = 0;
const animate = (now: number) => {
  frameCount++;
  if (frameCount % 2 !== 0) {
    animFrameRef.current = requestAnimationFrame(animate);
    return;
  }
  // ... resto da animação
};

// Reduzir partículas em mobile
const isMobile = window.innerWidth < 768;
const effectiveGap = isMobile ? gap * 1.5 : gap;
```

---

## Acessibilidade

O componente usa `role="img"` e `aria-label` com o texto original para screen readers. Se o texto for puramente decorativo:

```tsx
<ParticleText
  text="HydroSync"
  className="w-full h-full"
  // aria-label já usa o text prop automaticamente
/>
```

Para esconder completamente de screen readers:

```tsx
<ParticleText
  text="HydroSync"
  className="w-full h-full"
  aria-hidden="true"
/>
// Adicionar um h1 visível apenas para SR:
<h1 className="sr-only">HydroSync</h1>
```

---

## Integração com Next.js

### Requisitos

1. Componente é `"use client"` — não funciona como Server Component
2. A fonte usada em `ctx.font` precisa estar carregada antes da montagem
3. Se usar Tailwind, o container precisa ter `width` e `height` definidos (via classes ou estilo)
4. O canvas fica invisível para SEO — sempre ter um `<h1>` ou `aria-label` com o texto real

### Ordem no Hero

O ParticleText deve ficar em uma camada com `pointer-events-none` para não bloquear cliques em elementos abaixo, MAS o canvas precisa receber eventos de mouse para a repulsão funcionar. Solução:

```tsx
{/* Container com pointer-events-none para não bloquear cliques */}
<div className="pointer-events-none select-none">
  {/* Canvas com pointer-events-auto para capturar mouse */}
  <ParticleText
    text="HydroSync"
    className="w-full h-full pointer-events-auto"
  />
</div>
```

> **Importante:** Se o texto é puramente decorativo (background) e elementos interativos ficam por cima, use `pointer-events-none` no canvas também e remova `mouseRadius` ou passe `mouseRadius={0}`.

---

## Checklist

- [ ] Fonte usada em `ctx.font` está importada via `next/font/google`
- [ ] Container tem largura e altura definidas
- [ ] Texto real acessível via `aria-label` ou `<h1 class="sr-only">`
- [ ] `gap` ajustado para performance do target device
- [ ] Cores das partículas têm contraste suficiente com o fundo
- [ ] Comportamento de mouse testado (pointer-events correto)
- [ ] Resize testado — partículas devem se re-formar ao redimensionar
- [ ] `prefers-reduced-motion` respeitado (desabilitar animação para quem prefere)
