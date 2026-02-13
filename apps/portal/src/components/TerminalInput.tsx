"use client";

import { forwardRef } from "react";

interface TerminalInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

const TerminalInput = forwardRef<HTMLInputElement, TerminalInputProps>(
  ({ label, className = "", ...props }, ref) => {
    return (
      <div className="flex items-center gap-0 mb-1.5 flex-wrap rounded-sm focus-within:outline-2 focus-within:outline-accent focus-within:outline-offset-3">
        <label className="font-mono text-inherit text-text-muted whitespace-nowrap cursor-default">
          <span className="text-accent">$ </span>
          {label}
        </label>
        <input
          ref={ref}
          className={`flex-1 min-w-[180px] bg-transparent border-0 border-b border-accent/10 text-text font-mono text-inherit leading-[2] px-2 outline-none focus-visible:outline-none transition-colors focus:border-b-accent placeholder:text-text-muted/40 ${className}`}
          {...props}
        />
      </div>
    );
  }
);

TerminalInput.displayName = "TerminalInput";

export default TerminalInput;
