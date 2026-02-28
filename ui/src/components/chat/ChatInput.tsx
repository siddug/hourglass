'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { ImageData } from '@/lib/api';
import { IconButton } from '@/components/ui';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
  submitting?: boolean;
  images?: ImageData[];
  onImagesChange?: (images: ImageData[]) => void;
}

const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB max
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = "What would you like the agent to do?",
  submitting = false,
  images = [],
  onImagesChange,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // On mobile/touch devices, Enter inserts newline (send via button only)
    // On desktop, Enter submits and Shift+Enter inserts newline
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
      e.preventDefault();
      if (!disabled && (value.trim() || images.length > 0)) {
        onSubmit();
      }
    }
  };

  const processFile = useCallback(async (file: File): Promise<ImageData | null> => {
    if (!SUPPORTED_TYPES.includes(file.type as typeof SUPPORTED_TYPES[number])) {
      console.warn(`Unsupported image type: ${file.type}`);
      return null;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      console.warn(`Image too large: ${file.size} bytes`);
      return null;
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data URL prefix (e.g., "data:image/png;base64,")
        const base64Data = result.split(',')[1];
        if (base64Data) {
          resolve({
            data: base64Data,
            mediaType: file.type as ImageData['mediaType'],
          });
        } else {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !onImagesChange) return;

    const newImages: ImageData[] = [];
    for (const file of Array.from(files)) {
      const imageData = await processFile(file);
      if (imageData) {
        newImages.push(imageData);
      }
    }

    if (newImages.length > 0) {
      onImagesChange([...images, ...newImages]);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [images, onImagesChange, processFile]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    if (!onImagesChange) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    e.preventDefault();

    const newImages: ImageData[] = [];
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) {
        const imageData = await processFile(file);
        if (imageData) {
          newImages.push(imageData);
        }
      }
    }

    if (newImages.length > 0) {
      onImagesChange([...images, ...newImages]);
    }
  }, [images, onImagesChange, processFile]);

  const removeImage = useCallback((index: number) => {
    if (!onImagesChange) return;
    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);
  }, [images, onImagesChange]);

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const canSubmit = !disabled && !submitting && (value.trim() || images.length > 0);

  return (
    <div className="space-y-2">
      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 px-2">
          {images.map((image, index) => (
            <div key={index} className="relative group">
              <img
                src={`data:${image.mediaType};base64,${image.data}`}
                alt={`Attached image ${index + 1}`}
                className="h-16 w-16 object-cover rounded-lg border border-[var(--input-border)]"
              />
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove image"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled || submitting}
          rows={1}
          className="w-full px-4 py-3 pr-24 text-sm rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] focus:outline-none resize-none disabled:opacity-50 disabled:cursor-not-allowed"
        />

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Action buttons */}
        <div className="absolute right-3 bottom-3 flex items-center gap-1">
          {/* Image upload button */}
          {onImagesChange && (
            <IconButton
              onClick={handleImageClick}
              disabled={disabled || submitting}
              title="Attach images"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </IconButton>
          )}

          {/* Submit button */}
          <IconButton
            onClick={onSubmit}
            disabled={!canSubmit}
            variant="primary"
            title="Send message (Enter)"
          >
            {submitting ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            )}
          </IconButton>
        </div>
      </div>
    </div>
  );
}
