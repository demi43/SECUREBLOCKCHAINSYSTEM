import * as React from "react";

interface RadioGroupContextType {
  value?: string;
  onValueChange?: (value: string) => void;
}

const RadioGroupContext = React.createContext<RadioGroupContextType>({});

export interface RadioGroupProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
  value,
  onValueChange,
  children,
  className = "",
}) => {
  return (
    <RadioGroupContext.Provider value={{ value, onValueChange }}>
      <div className={`radio-group ${className}`} role="radiogroup">
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
};

export interface RadioGroupItemProps {
  value: string;
  id: string;
  className?: string;
  children?: React.ReactNode;
}

export const RadioGroupItem: React.FC<RadioGroupItemProps> = ({
  value: itemValue,
  id,
  className = "",
  children,
}) => {
  const { value, onValueChange } = React.useContext(RadioGroupContext);
  const isChecked = value === itemValue;
  const isDisabled = className?.includes('pointer-events-none') || false;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isDisabled && onValueChange && e.target.checked) {
      onValueChange(itemValue);
    }
  };

  const handleLabelClick = (e: React.MouseEvent) => {
    // Only prevent default if the item is actually disabled
    if (isDisabled) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // For enabled items, manually trigger the selection
    // This ensures the onValueChange is called even when clicking the label
    if (onValueChange) {
      onValueChange(itemValue);
    }
  };

  return (
    <div className={`radio-group-item ${className}`}>
      <input
        type="radio"
        id={id}
        name="candidate"
        value={itemValue}
        checked={isChecked}
        onChange={handleChange}
        disabled={isDisabled}
        className="radio-input"
      />
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          // Handle both Label component and native label elements
          const childType = (child.type as any)?.displayName || (child.type as any)?.name || '';
          const isLabel = childType === 'Label' || 
                         child.type === 'label' || 
                         (typeof child.type === 'string' && child.type === 'label') ||
                         (child.props as any)?.htmlFor !== undefined;
          
          if (isLabel) {
            return React.cloneElement(child, { 
              htmlFor: id,
              onClick: handleLabelClick,
              style: { cursor: 'pointer', ...((child.props as any)?.style || {}) }
            } as any);
          }
        }
        return child;
      })}
    </div>
  );
};

