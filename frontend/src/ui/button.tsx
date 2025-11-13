import * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md" | "lg";
  variant?: "default" | "secondary" | "danger" | "ghost" | "outline" | "destructive";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", size = "md", variant = "default", children, ...props }, ref) => {
    const sizeClasses = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-4 py-2 text-base",
      lg: "px-6 py-3 text-lg",
    };

    const variantClasses = {
      default: "btn btn-primary",
      secondary: "btn btn-secondary",
      danger: "btn btn-danger",
      destructive: "btn btn-danger",
      outline: "btn btn-secondary",
      ghost: "btn btn-secondary",
    };

    return (
      <button
        ref={ref}
        className={`${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

