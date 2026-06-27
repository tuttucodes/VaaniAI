import * as React from "react";
import { cn } from "@/lib/utils";

export const FieldGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("flex flex-col gap-4", className)} {...props} />
);
FieldGroup.displayName = "FieldGroup";

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "vertical" | "horizontal";
}

export const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  ({ className, orientation = "vertical", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex gap-2 data-[invalid]:text-destructive data-[disabled]:opacity-60",
        orientation === "horizontal" ? "items-center justify-between" : "flex-col",
        className
      )}
      {...props}
    />
  )
);
Field.displayName = "Field";

export const FieldLabel = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn("text-sm font-medium leading-none", className)} {...props} />
  )
);
FieldLabel.displayName = "FieldLabel";

export const FieldTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-sm font-medium leading-none", className)} {...props} />
  )
);
FieldTitle.displayName = "FieldTitle";

export const FieldDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-xs leading-relaxed text-muted-foreground", className)} {...props} />
  )
);
FieldDescription.displayName = "FieldDescription";

export const FieldSet = React.forwardRef<HTMLFieldSetElement, React.FieldsetHTMLAttributes<HTMLFieldSetElement>>(
  ({ className, ...props }, ref) => <fieldset ref={ref} className={cn("flex flex-col gap-3", className)} {...props} />
);
FieldSet.displayName = "FieldSet";

export const FieldLegend = React.forwardRef<HTMLLegendElement, React.HTMLAttributes<HTMLLegendElement>>(
  ({ className, ...props }, ref) => <legend ref={ref} className={cn("text-sm font-semibold", className)} {...props} />
);
FieldLegend.displayName = "FieldLegend";
