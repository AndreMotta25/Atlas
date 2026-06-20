import React from 'react';

interface ThinkingIndicatorProps {
  /** Whether the assistant has started producing visible content yet. */
  hasContent: boolean;
}

/**
 * Animated indicator shown in conversation headers while the AI model is working.
 *
 * Uses a pulsing-ring radar animation for "thinking" and a wave-bar animation for
 * "generating response", giving the user clear visual feedback about model activity.
 */
export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({ hasContent }) => (
  <div className="flex items-center gap-2 ml-1">
    {/* Icon animation */}
    <span className="relative flex items-center justify-center w-4 h-4 shrink-0">
      {/* Radar pulse rings */}
      <span
        className="absolute inset-0 rounded-full border border-primary/50"
        style={{
          animation: 'radar-pulse 2s ease-out infinite',
        }}
      />
      <span
        className="absolute inset-0 rounded-full border border-primary/30"
        style={{
          animation: 'radar-pulse 2s ease-out infinite',
          animationDelay: '0.6s',
        }}
      />
      {/* Core dot */}
      <span className="relative w-1.5 h-1.5 rounded-full bg-primary z-10" />
    </span>

    {/* Text indicator */}
    <span
      className="text-[11px] font-medium bg-gradient-to-r from-primary/80 via-primary to-primary/80 bg-[length:200%_100%] bg-clip-text text-transparent"
      style={{
        animation: 'shimmer-text 2s ease-in-out infinite',
      }}
    >
      {hasContent ? 'Gerando resposta...' : 'Pensando...'}
    </span>
  </div>
);
