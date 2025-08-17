import { forwardRef, KeyboardEvent, DragEvent } from "react";
import { Text } from "../ui/typography";

interface PromptTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  maxLength?: number;
  minLength?: number;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
  error?: string | null;
}

export const PromptTextarea = forwardRef<HTMLTextAreaElement, PromptTextareaProps>(
  (
    {
      value,
      onChange,
      onSubmit,
      placeholder = "Describe what you want to create...",
      maxLength = 2000,
      minLength = 10,
      disabled = false,
      busy = false,
      className = "h-32",
      id,
      ariaLabel,
      error,
    },
    ref
  ) => {
    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !busy && !disabled && value.trim() && onSubmit) {
        e.preventDefault();
        onSubmit();
      }
    };

    const handleDragOver = (e: DragEvent<HTMLTextAreaElement>) => {
      if (e.dataTransfer?.types.includes("text/plain")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    };

    const handleDrop = (e: DragEvent<HTMLTextAreaElement>) => {
      const data = e.dataTransfer?.getData("text/plain");
      if (!data) return;
      e.preventDefault();
      
      const target = e.currentTarget;
      const start = target.selectionStart ?? 0;
      const end = target.selectionEnd ?? 0;
      const before = value.slice(0, start);
      const after = value.slice(end);
      const next = before + data + after;
      
      onChange(next);
      
      requestAnimationFrame(() => {
        target.focus();
        const pos = before.length + data.length;
        target.setSelectionRange(pos, pos);
      });
    };

    const getHelpText = () => {
      if (value.length === 0) return "Prompt is required";
      if (value.length < minLength) return "Consider adding more detail for better results";
      if (onSubmit) return "Press Ctrl+Enter to generate";
      return "";
    };

    const helpTextId = id ? `${id}-help` : undefined;

    return (
      <div className="relative">
        <textarea
          ref={ref}
          id={id}
          className={`input resize-none ${className}`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          disabled={disabled || busy}
          aria-label={ariaLabel}
          aria-required="true"
          aria-invalid={error ? "true" : undefined}
          aria-describedby={helpTextId}
        />
        <div className="flex justify-between items-center mt-1">
          <Text size="xs" tone="muted" id={helpTextId}>
            {getHelpText()}
          </Text>
          <Text 
            size="xs" 
            tone="muted" 
            className={value.length > maxLength * 0.8 ? "text-amber-400" : ""}
          >
            {value.length}/{maxLength}
          </Text>
        </div>
      </div>
    );
  }
);

PromptTextarea.displayName = "PromptTextarea";