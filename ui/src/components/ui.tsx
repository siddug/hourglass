'use client';

import { ButtonHTMLAttributes, forwardRef, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';

// Button component
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', ...props }, ref) => {
    const baseClasses = 'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none';

    const variants = {
      primary: 'bg-hg-primary text-white hover:opacity-90 focus:ring-hg-primary/50',
      secondary: 'bg-hg-surface-container-high text-hg-on-surface hover:bg-hg-surface-variant focus:ring-hg-outline-variant',
      danger: 'bg-hg-error text-white hover:opacity-90 focus:ring-hg-error/50',
      ghost: 'bg-transparent text-hg-on-surface-variant hover:bg-hg-surface-container focus:ring-hg-outline-variant',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
    };

    return (
      <button
        ref={ref}
        className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

// Input component
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full px-3 py-2 border border-hg-outline-variant/30 bg-hg-surface-container rounded-lg text-hg-on-surface shadow-sm focus:outline-none focus:ring-2 focus:ring-hg-primary/50 focus:border-hg-primary/50 ${className}`}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

// Textarea component
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`w-full px-3 py-2 border border-hg-outline-variant/30 bg-hg-surface-container rounded-lg text-hg-on-surface shadow-sm focus:outline-none focus:ring-2 focus:ring-hg-primary/50 focus:border-hg-primary/50 resize-none ${className}`}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

// Card component
interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-hg-surface-container-low rounded-xl border border-hg-outline-variant/20 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: CardProps) {
  return (
    <div className={`px-4 py-3 border-b border-hg-outline-variant/20 ${className}`}>
      {children}
    </div>
  );
}

export function CardContent({ children, className = '' }: CardProps) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}

// Badge component
interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'approval' | 'done' | 'archived';
  className?: string;
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  const variants = {
    default: 'bg-hg-surface-container-high text-hg-on-surface-variant',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    error: 'bg-hg-error/10 text-hg-error',
    info: 'bg-hg-primary/10 text-hg-primary',
    approval: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
    done: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    archived: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

// Status badge helper
export function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, BadgeProps['variant']> = {
    triage: 'warning',
    in_progress: 'info',
    running: 'info',
    completed: 'success',
    failed: 'error',
    killed: 'warning',
    approval: 'approval',
    done: 'done',
    archived: 'archived',
  };

  const labelMap: Record<string, string> = {
    triage: 'Todo',
    in_progress: 'Agent WIP',
    running: 'Running',
    completed: 'Agent Completed',
    failed: 'Agent Failed',
    killed: 'Killed',
    approval: 'Agent Requires Approval',
    done: 'Done',
    archived: 'Archived',
  };

  return <Badge variant={variantMap[status] || 'default'}>{labelMap[status] || status}</Badge>;
}

// Provider badge helper
interface ProviderBadgeProps {
  provider: string;
  className?: string;
}

export function ProviderBadge({ provider, className = '' }: ProviderBadgeProps) {
  const providerStyles: Record<string, { bg: string; text: string; label: string }> = {
    claude: {
      bg: 'bg-orange-500/10',
      text: 'text-orange-600 dark:text-orange-400',
      label: 'Claude',
    },
    vibe: {
      bg: 'bg-hg-tertiary/10',
      text: 'text-hg-tertiary',
      label: 'Mistral Vibe',
    },
  };

  const style = providerStyles[provider] || {
    bg: 'bg-hg-surface-container-high',
    text: 'text-hg-on-surface-variant',
    label: provider,
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text} ${className}`}
    >
      {style.label}
    </span>
  );
}

// AI Logo component
interface AILogoProps {
  provider: string;
  className?: string;
}

export function AILogo({ provider, className = '' }: AILogoProps) {
  const getLogo = () => {
    switch (provider.toLowerCase()) {
      case 'claude':
        return (
          <div className={`w-6 h-6 flex items-center justify-center ${className}`}>
            <img src="/claude.svg" alt="Claude" className="w-full h-full object-contain" />
          </div>
        );
      case 'vibe':
      case 'mistral':
        return (
          <div className={`w-6 h-6 flex items-center justify-center ${className}`}>
            <img src="/mistral.svg" alt="Mistral Vibe" className="w-full h-full object-contain" />
          </div>
        );
      default:
        return (
          <div className={`w-6 h-6 flex items-center justify-center text-xl ${className}`}>
            🤖
          </div>
        );
    }
  };

  return getLogo();
}

// User Avatar component
interface UserAvatarProps {
  className?: string;
}

export function UserAvatar({ className = '' }: UserAvatarProps) {
  return (
    <div className={`w-6 h-6 flex items-center justify-center ${className}`}>
      <div className="w-5 h-5 rounded-full bg-hg-surface-container-high" />
    </div>
  );
}

// Modal/Dialog component
interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  className?: string;
  fullHeight?: boolean;
}

export function Dialog({ open, onClose, children, title, className = 'max-w-lg', fullHeight = false }: DialogProps) {
  if (!open) return null;

  const heightClasses = fullHeight ? 'h-[90vh]' : 'max-h-[90vh]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className={`relative bg-hg-surface-container-low rounded-xl border border-hg-outline-variant/20 shadow-xl w-full mx-4 ${heightClasses} overflow-hidden flex flex-col ${className}`}>
        {title && (
          <div className="px-4 py-3 border-b border-hg-outline-variant/20 flex items-center justify-between flex-shrink-0">
            <h2 className="text-lg font-semibold text-hg-on-surface">{title}</h2>
            <button
              onClick={onClose}
              className="text-hg-on-surface-variant hover:text-hg-on-surface cursor-pointer transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className={`p-0 flex flex-col overflow-y-auto ${fullHeight ? 'flex-1 min-h-0' : 'max-h-full'}`}>{children}</div>
      </div>
    </div>
  );
}

// Dropdown/Select component
interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface DropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  size?: 'sm' | 'md';
}

export function Dropdown({ value, onChange, options, className = '', disabled = false, placeholder, size = 'md' }: DropdownProps) {
  const selectedOption = options.find((opt) => opt.value === value);

  const sizeStyles = {
    sm: {
      button: 'py-1 pl-2 pr-6 text-xs rounded-lg',
      iconContainer: 'pr-1.5',
      icon: 'h-4 w-4',
      option: 'py-1.5 pl-7 pr-3',
      checkIcon: 'pl-2 h-7 w-5',
    },
    md: {
      button: 'py-1.5 pl-3 pr-8 text-sm rounded-lg',
      iconContainer: 'pr-2',
      icon: 'h-4 w-4',
      option: 'py-2 pl-2 pr-4',
      checkIcon: 'pl-3 h-4 w-4',
    },
  };

  const styles = sizeStyles[size];

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className={`relative ${className}`}>
        <ListboxButton
          className={`relative w-full border h-full border-hg-outline-variant/30 bg-hg-surface-container ${styles.button} text-left text-hg-on-surface focus:outline-none focus:ring-2 focus:ring-hg-primary/50 focus:border-hg-primary/50 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span className="flex items-center gap-2 truncate">
            {selectedOption?.icon}
            {selectedOption?.label || placeholder || 'Select...'}
          </span>
          <span className={`pointer-events-none absolute inset-y-0 right-0 flex items-center ${styles.iconContainer}`}>
            <svg className={`${styles.icon} text-hg-on-surface-variant`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </span>
        </ListboxButton>

        <ListboxOptions
          anchor="bottom"
          className={`absolute z-50 mt-1 max-h-60 min-w-[var(--button-width)] overflow-auto rounded-lg bg-hg-surface-container-low border border-hg-outline-variant/20 py-1 ${size === 'sm' ? 'text-xs' : 'text-sm'} shadow-lg focus:outline-none`}
        >
          {options.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              className={`group relative cursor-pointer select-none ${styles.option} text-hg-on-surface data-[focus]:bg-hg-primary data-[focus]:text-white`}
            >
              {({ selected }) => (
                <>
                  <span className={`flex items-center gap-2 truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                    {option.icon}
                    {option.label}
                  </span>
                  {selected && (
                    <span className={`absolute inset-y-0 left-0 flex items-center ${styles.checkIcon} text-hg-primary group-data-[focus]:text-white`}>
                      <svg className="h-7 w-6" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                    </span>
                  )}
                </>
              )}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}

// IconButton component
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger' | 'warning';
  size?: 'sm' | 'md' | 'lg';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className = '', variant = 'default', size = 'md', disabled, ...props }, ref) => {
    const variants = {
      default: 'text-hg-on-surface-variant hover:text-hg-on-surface',
      primary: 'text-hg-primary hover:text-hg-primary/80',
      danger: 'text-hg-error hover:text-hg-error/80',
      warning: 'text-amber-500 hover:text-amber-600',
    };

    const sizes = {
      sm: 'p-1',
      md: 'p-1.5',
      lg: 'p-2',
    };

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`inline-flex items-center justify-center rounded transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      />
    );
  }
);
IconButton.displayName = 'IconButton';

// Loading spinner
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin h-5 w-5 ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
