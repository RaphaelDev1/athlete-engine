import { TextareaHTMLAttributes, forwardRef } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={textareaId} className="label">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={`
            input-field min-h-[80px] resize-y
            ${error ? "border-danger-500 focus:ring-danger-500/50 focus:border-danger-500" : ""}
            ${className}
          `}
          {...props}
        />
        {error && <p className="text-xs text-danger-400">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
