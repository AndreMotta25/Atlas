import React from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * Accessible switch (role="switch"). Toggles on click, Space, or Enter.
 *
 * Visual: pill track with a sliding circle. Uses semantic tokens so it
 * adapts to light/dark mode automatically.
 */
export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
}) => {
  const handleClick = (): void => {
    if (!disabled) onChange(!checked);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!checked);
    }
  };

  const switchId = id ?? `toggle-${React.useId()}`;

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        {label && (
          <label
            htmlFor={switchId}
            className={`text-sm font-medium ${disabled ? 'text-muted-foreground/60' : 'text-foreground'} cursor-pointer select-none`}
          >
            {label}
          </label>
        )}
        {description && (
          <p className={`text-xs mt-0.5 ${disabled ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        id={switchId}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={description ? `${switchId}-desc` : undefined}
        disabled={disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`relative shrink-0 inline-flex h-5 w-9 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
          checked ? 'bg-primary' : 'bg-muted-foreground/30'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow transform transition-transform mt-0.5 ${
            checked ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </button>
      {description && <span id={`${switchId}-desc`} className="sr-only">{description}</span>}
    </div>
  );
};
