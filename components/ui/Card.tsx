import { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingStyles = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

export function Card({
  hover = false,
  padding = "md",
  className = "",
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={`
        ${hover ? "card-hover" : "card"}
        ${paddingStyles[padding]}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex items-center justify-between mb-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={`section-title ${className}`} {...props}>
      {children}
    </h3>
  );
}
