import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  suffix?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, suffix, className = "", id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="label">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            className={`
              input-field
              ${suffix ? "pr-12" : ""}
              ${error ? "border-danger-500 focus:ring-danger-500/50 focus:border-danger-500" : ""}
              ${className}
            `}
            {...props}
          />
          {suffix && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-surface-500">
              {suffix}
            </span>
          )}
        </div>
        {error && <p className="text-xs text-danger-400">{error}</p>}
        {hint && !error && (
          <p className="text-xs text-surface-500">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
