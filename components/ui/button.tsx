import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive";
type ButtonSize = "default" | "sm" | "lg" | "icon";

const variants: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground shadow-panel hover:bg-primary/92",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90"
};

const sizes: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2 text-sm",
  sm: "h-8 px-3 text-xs",
  lg: "h-11 px-5 text-sm",
  icon: "size-10"
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", asChild, children, ...props }, ref) => {
    const classes = cn(
      "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4",
      variants[variant],
      sizes[size],
      className
    );

    if (asChild && React.isValidElement<{ className?: string }>(children)) {
      return React.cloneElement(children, {
        className: cn(classes, children.props.className)
      });
    }

    return (
      <button ref={ref} type={type} className={classes} {...props}>
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
