import React from "react";
import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = "md",
  className = "",
}: EmptyStateProps) {
  const iconSize = size === "sm" ? 20 : size === "md" ? 28 : 36;
  const wrapperPad = size === "sm" ? "py-6 px-4" : size === "md" ? "py-10 px-6" : "py-16 px-8";

  return (
    <div className={`flex flex-col items-center justify-center text-center ${wrapperPad} ${className}`}>
      <div className={`rounded-2xl bg-muted/60 flex items-center justify-center mb-3 ${
        size === "sm" ? "w-10 h-10" : size === "md" ? "w-14 h-14" : "w-18 h-18"
      }`}>
        <Icon size={iconSize} className="text-muted-foreground/40" />
      </div>
      <p className={`font-medium text-foreground/70 ${size === "sm" ? "text-sm" : "text-base"}`}>
        {title}
      </p>
      {description && (
        <p className={`text-muted-foreground mt-1 max-w-xs leading-relaxed ${size === "sm" ? "text-xs" : "text-sm"}`}>
          {description}
        </p>
      )}
      {action && (
        <Button
          variant="outline"
          size="sm"
          onClick={action.onClick}
          className="mt-4 rounded-xl font-sans text-sm"
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
