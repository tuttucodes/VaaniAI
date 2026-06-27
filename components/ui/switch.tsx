"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(({ className, label, ...props }, ref) => (
  <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm", className)}>
    <input ref={ref} type="checkbox" className="peer sr-only" {...props} />
    <span className="relative h-5 w-9 rounded-full bg-muted transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-background after:shadow after:transition-transform peer-checked:bg-primary peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-ring" />
    {label ? <span>{label}</span> : null}
  </label>
));
Switch.displayName = "Switch";
