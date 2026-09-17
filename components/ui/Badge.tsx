import { HTMLAttributes } from "react";

type BadgeVariant =
  | "default"
  | "brand"
  | "success"
  | "info"
  | "danger"
  | "warning";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-surface-700 text-surface-300",
  brand: "bg-brand-500/15 text-brand-400",
  success: "bg-success-500/15 text-success-400",
  info: "bg-info-500/15 text-info-400",
  danger: "bg-danger-500/15 text-danger-400",
  warning: "bg-warning-500/15 text-warning-400",
};

export function Badge({
  variant = "default",
  className = "",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-0.5 rounded-full
        text-xs font-medium
        ${variantStyles[variant]}
        ${className}
      `}
      {...props}
    >
      {children}
    </span>
  );
}
