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
    const baseClasses = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';

    const variants = {
      primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
      secondary: 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600 focus:ring-gray-500',
      danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
      ghost: 'bg-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:ring-gray-500',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
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
        className={`w-full px-3 py-2 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${className}`}
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
        className={`w-full px-3 py-2 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none ${className}`}
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
    <div className={`bg-[var(--card-bg)] rounded-lg border border-[var(--card-border)] shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: CardProps) {
  return (
    <div className={`px-4 py-3 border-b border-[var(--card-border)] ${className}`}>
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
    default: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200',
    success: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
    warning: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
    error: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
    info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
    approval: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-300',
    done: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300',
    archived: 'bg-slate-100 dark:bg-slate-900/30 text-slate-800 dark:text-slate-300',
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
    running: 'info', // Legacy support
    completed: 'success',
    failed: 'error',
    killed: 'warning', // Legacy support
    approval: 'approval',
    done: 'done',
    archived: 'archived',
  };

  // Display friendly labels
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

// Provider badge helper - shows the AI provider with distinct styling
interface ProviderBadgeProps {
  provider: string;
  className?: string;
}

export function ProviderBadge({ provider, className = '' }: ProviderBadgeProps) {
  // Map connector names to display info
  const providerStyles: Record<string, { bg: string; text: string; label: string }> = {
    claude: {
      bg: 'bg-orange-100 dark:bg-orange-900/30',
      text: 'text-orange-800 dark:text-orange-300',
      label: 'Claude',
    },
    vibe: {
      bg: 'bg-purple-100 dark:bg-purple-900/30',
      text: 'text-purple-800 dark:text-purple-300',
      label: 'Mistral Vibe',
    },
  };

  const style = providerStyles[provider] || {
    bg: 'bg-gray-100 dark:bg-gray-700',
    text: 'text-gray-800 dark:text-gray-200',
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

// AI Logo component - shows the appropriate logo based on connector type
interface AILogoProps {
  provider: string;
  className?: string;
}

export function AILogo({ provider, className = '' }: AILogoProps) {
  // Map connector names to appropriate logos
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
            <img src="/m-rainbow.png" alt="Mistral Vibe" className="w-full h-full object-contain" />
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

// User Avatar component - shows a generic person icon
interface UserAvatarProps {
  className?: string;
}

export function UserAvatar({ className = '' }: UserAvatarProps) {
  return (
    <div className={`w-6 h-6 flex items-center justify-center text-xl ${className}`}>
      👤
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
  /** When true, dialog expands to fill available height (90vh) instead of shrinking to content */
  fullHeight?: boolean;
}

export function Dialog({ open, onClose, children, title, className = 'max-w-lg', fullHeight = false }: DialogProps) {
  if (!open) return null;

  const heightClasses = fullHeight ? 'h-[90vh]' : 'max-h-[90vh]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className={`relative bg-[var(--card-bg)] rounded-lg shadow-xl w-full mx-4 ${heightClasses} overflow-hidden flex flex-col ${className}`}>
        {title && (
          <div className="px-4 py-3 border-b border-[var(--card-border)] flex items-center justify-between flex-shrink-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
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
      button: 'py-1 pl-2 pr-6 text-xs rounded',
      iconContainer: 'pr-1.5',
      icon: 'h-4 w-4',
      option: 'py-1.5 pl-7 pr-3',
      checkIcon: 'pl-2 h-7 w-5',
    },
    md: {
      button: 'py-1.5 pl-3 pr-8 text-sm rounded-md',
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
          className={`relative w-full border h-full border-[var(--input-border)] bg-[var(--input-bg)] ${styles.button} text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span className="flex items-center gap-2 truncate">
            {selectedOption?.icon}
            {selectedOption?.label || placeholder || 'Select...'}
          </span>
          <span className={`pointer-events-none absolute inset-y-0 right-0 flex items-center ${styles.iconContainer}`}>
            <svg className={`${styles.icon} text-gray-400`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </span>
        </ListboxButton>

        <ListboxOptions
          anchor="bottom"
          className={`absolute z-50 mt-1 max-h-60 min-w-[var(--button-width)] overflow-auto rounded-md bg-[var(--card-bg)] py-1 ${size === 'sm' ? 'text-xs' : 'text-sm'} shadow-lg ring-1 ring-black/5 focus:outline-none`}
        >
          {options.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              className={`group relative cursor-pointer select-none ${styles.option} text-[var(--text-primary)] data-[focus]:bg-blue-600 data-[focus]:text-white`}
            >
              {({ selected }) => (
                <>
                  <span className={`flex items-center gap-2 truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                    {option.icon}
                    {option.label}
                  </span>
                  {selected && (
                    <span className={`absolute inset-y-0 left-0 flex items-center ${styles.checkIcon} text-blue-600 group-data-[focus]:text-white`}>
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

// IconButton component - just an icon that's clickable (no button background)
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger' | 'warning';
  size?: 'sm' | 'md' | 'lg';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className = '', variant = 'default', size = 'md', disabled, ...props }, ref) => {
    const variants = {
      default: 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
      primary: 'text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300',
      danger: 'text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300',
      warning: 'text-yellow-500 hover:text-yellow-600 dark:text-yellow-400 dark:hover:text-yellow-300',
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
