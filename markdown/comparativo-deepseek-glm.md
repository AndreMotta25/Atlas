# Comparativo: DeepSeek vs GLM — Especificações Técnicas

| Especificação         | DeepSeek-V3                       | DeepSeek-R1                      | DeepSeek V4 Pro                                   | GLM-4.5                                 | GLM-4.5-Air                           |
| --------------------- | --------------------------------- | -------------------------------- | ------------------------------------------------- | --------------------------------------- | ------------------------------------- |
| **Parâmetros totais** | 671B MoE                          | 671B MoE (base V3)               | 1,6T MoE                                          | 355B MoE                                | 106B MoE                              |
| **Parâmetros ativos** | ~37B                              | ~37B                             | ~49B                                              | 32B                                     | 12B                                   |
| **Arquitetura**       | MoE + Multi-head Latent Attention | MoE + Cadeia de Pensamento (CoT) | MoE + CSA + HCA (atenção híbrida)                 | MoE híbrido (thinking / non-thinking)   | MoE híbrido (thinking / non-thinking) |
| **Contexto máximo**   | 128K tokens                       | 128K tokens                      | 1M tokens                                         | 128K tokens                             | 128K tokens                           |
| **Saída máxima**      | —                                 | —                                | ~384K tokens                                      | —                                       | —                                     |
| **Licença**           | MIT (pesos abertos)               | MIT (pesos abertos)              | MIT (pesos abertos)                               | Pesos abertos                           | Pesos abertos                         |
| **Lançamento**        | Dez/2024                          | Jan/2025                         | Abr/2026                                          | Jul/2025                                | Jul/2025                              |
| **Foco principal**    | Texto, matemática, código         | Raciocínio profundo (CoT)        | Raciocínio pesado, coding agentic, contexto longo | Raciocínio, coding, agentic (unificado) | Mesmo, versão mais leve e rápida      |

## Destaques

**DeepSeek V4 Pro** — modelo mais recente e potente. Usa CSA (Compressed Sparse Attention) e HCA (Heavily Compressed Attention) para contexto de 1M tokens com menor custo. Três modos de raciocínio: Non-Think, Think High e Think Max.

**GLM-4.5** — modelo híbrido que alterna entre modo thinking (raciocínio complexo) e non-thinking (respostas rápidas). Pontua 64,2% no SWE-bench Verified e 91% no AIME 2024.

## Fontes

- [1] eigent.ai — DeepSeek V4 Pro: Especificações, Benchmarks e Preços (2026)
- [2] z.ai — GLM-4.5: Reasoning, Coding, and Agentic Abilities
