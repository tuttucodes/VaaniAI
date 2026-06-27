"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function ToggleGroup({
  value,
  onValueChange,
  children,
  className,
  name
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  name?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-md border bg-background p-1", className)} role="radiogroup" aria-label={name}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement<ToggleGroupItemProps>(child)) return child;
        return React.cloneElement(child, {
          active: child.props.value === value,
          onSelect: () => onValueChange(child.props.value)
        });
      })}
    </div>
  );
}

export interface ToggleGroupItemProps {
  value: string;
  children: React.ReactNode;
  active?: boolean;
  onSelect?: () => void;
}

export function ToggleGroupItem({ children, active, onSelect }: ToggleGroupItemProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className={cn(
        "rounded-sm px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground shadow-panel" : "text-muted-foreground hover:bg-muted"
      )}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}
