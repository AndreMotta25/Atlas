import React from 'react';

interface ThinkingIndicatorProps {
  /** Whether the assistant has started producing visible content yet. */
  hasContent: boolean;
}

/**
 * Three bouncing dots that form a wave pattern while the AI model is working.
 * Each dot peaks at a different time, creating a fluid cascading motion.
 *
 * Animation defined via `@keyframes dot-wave` + `.dot-wave` class in index.css.
 */
export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({ hasContent }) => (
  <div className="flex items-center gap-2 ml-1">
    <span className="flex items-center gap-[3px] shrink-0">
      <span className="dot-wave inline-block w-1.5 h-1.5 rounded-full bg-primary" style={{ animationDelay: '0s' }} />
      <span className="dot-wave inline-block w-1.5 h-1.5 rounded-full bg-primary" style={{ animationDelay: '0.15s' }} />
      <span className="dot-wave inline-block w-1.5 h-1.5 rounded-full bg-primary" style={{ animationDelay: '0.30s' }} />
    </span>

    <span className="text-[11px] text-muted-foreground">
      {hasContent ? 'Gerando resposta...' : 'Pensando...'}
    </span>
  </div>
);
