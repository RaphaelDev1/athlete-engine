import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="p-4 rounded-full bg-surface-800 mb-4">
        <Icon className="w-8 h-8 text-surface-500" />
      </div>
      <h3 className="text-lg font-medium text-surface-200 mb-1">{title}</h3>
      <p className="text-sm text-surface-400 text-center max-w-sm mb-6">
        {description}
      </p>
      {action}
    </div>
  );
}
