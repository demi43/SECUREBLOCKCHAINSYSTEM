import * as React from "react";
import { Button } from "../../ui/button";

interface AlertDialogContextType {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AlertDialogContext = React.createContext<AlertDialogContextType | null>(null);

export interface AlertDialogProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const AlertDialog: React.FC<AlertDialogProps> = ({
  children,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}) => {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  const onOpenChange = controlledOnOpenChange ?? setInternalOpen;

  return (
    <AlertDialogContext.Provider value={{ open, onOpenChange }}>
      {children}
    </AlertDialogContext.Provider>
  );
};

export interface AlertDialogTriggerProps {
  asChild?: boolean;
  children: React.ReactNode;
}

export const AlertDialogTrigger: React.FC<AlertDialogTriggerProps> = ({ asChild, children }) => {
  const context = React.useContext(AlertDialogContext);
  if (!context) throw new Error("AlertDialogTrigger must be used within AlertDialog");

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      onClick: () => context.onOpenChange(true),
    } as any);
  }

  return (
    <button type="button" onClick={() => context.onOpenChange(true)}>
      {children}
    </button>
  );
};

export interface AlertDialogContentProps {
  children: React.ReactNode;
  className?: string;
}

export const AlertDialogContent: React.FC<AlertDialogContentProps> = ({ children, className = "" }) => {
  const context = React.useContext(AlertDialogContext);
  if (!context) throw new Error("AlertDialogContent must be used within AlertDialog");

  if (!context.open) return null;

  return (
    <div className="alert-dialog-overlay" onClick={() => context.onOpenChange(false)}>
      <div className={`alert-dialog-content ${className}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
};

export interface AlertDialogHeaderProps {
  children: React.ReactNode;
}

export const AlertDialogHeader: React.FC<AlertDialogHeaderProps> = ({ children }) => {
  return <div className="alert-dialog-header">{children}</div>;
};

export interface AlertDialogTitleProps {
  children: React.ReactNode;
  className?: string;
}

export const AlertDialogTitle: React.FC<AlertDialogTitleProps> = ({ children, className = "" }) => {
  return <h2 className={`alert-dialog-title ${className}`}>{children}</h2>;
};

export interface AlertDialogDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export const AlertDialogDescription: React.FC<AlertDialogDescriptionProps> = ({
  children,
  className = "",
}) => {
  return <p className={`alert-dialog-description ${className}`}>{children}</p>;
};

export interface AlertDialogFooterProps {
  children: React.ReactNode;
}

export const AlertDialogFooter: React.FC<AlertDialogFooterProps> = ({ children }) => {
  return <div className="alert-dialog-footer">{children}</div>;
};

export interface AlertDialogActionProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export const AlertDialogAction: React.FC<AlertDialogActionProps> = ({
  children,
  onClick,
  className = "",
}) => {
  const context = React.useContext(AlertDialogContext);
  if (!context) throw new Error("AlertDialogAction must be used within AlertDialog");

  const handleClick = () => {
    onClick?.();
    context.onOpenChange(false);
  };

  return (
    <Button onClick={handleClick} className={className}>
      {children}
    </Button>
  );
};

export interface AlertDialogCancelProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export const AlertDialogCancel: React.FC<AlertDialogCancelProps> = ({
  children,
  onClick,
  className = "",
}) => {
  const context = React.useContext(AlertDialogContext);
  if (!context) throw new Error("AlertDialogCancel must be used within AlertDialog");

  const handleClick = () => {
    onClick?.();
    context.onOpenChange(false);
  };

  return (
    <Button variant="secondary" onClick={handleClick} className={className}>
      {children}
    </Button>
  );
};

