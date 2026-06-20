import { BoltIcon } from './icons';

interface SendButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  className?: string;
}

export const SendButton: React.FC<SendButtonProps> = ({
  onClick,
  disabled = false,
  loading = false,
  label = 'Enviar',
  className = '',
}) => {
  return (
    <button
      type="submit"
      onClick={onClick}
      disabled={disabled || loading}
      className={`flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:brightness-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0 ${loading ? 'animate-pulse-opacity' : ''} ${className}`}
    >
      <BoltIcon className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );
};
