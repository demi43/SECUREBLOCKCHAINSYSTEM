import * as React from "react";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "success" | "error" | "warning" | "info";
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className = "", variant = "default", children, ...props }, ref) => {
    const variantClasses = {
      default: "status-message",
      success: "status-message status-success",
      error: "status-message status-error",
      warning: "status-message status-warning",
      info: "status-message status-info",
    };

    return (
      <div
        ref={ref}
        className={`${variantClasses[variant]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Alert.displayName = "Alert";

export interface AlertDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export const AlertDescription = React.forwardRef<HTMLParagraphElement, AlertDescriptionProps>(
  ({ className = "", ...props }, ref) => {
    return (
      <p
        ref={ref}
        className={`alert-description ${className}`}
        {...props}
      />
    );
  }
);

AlertDescription.displayName = "AlertDescription";

