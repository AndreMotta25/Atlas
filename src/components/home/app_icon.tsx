import React from 'react';
import iconUrl from '../../../build/icon.png';

interface AppIconProps {
  className?: string;
}

export const AppIcon: React.FC<AppIconProps> = ({ className = 'w-16 h-16' }) => (
  <div
    className={`relative inline-flex items-center justify-center ${className}`}
    aria-label="Atlas"
  >
    <div
      className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse-opacity"
      aria-hidden
    />
    <img
      src={iconUrl}
      alt=""
      draggable={false}
      className="relative w-full h-full object-contain select-none drop-shadow-lg"
    />
  </div>
);
