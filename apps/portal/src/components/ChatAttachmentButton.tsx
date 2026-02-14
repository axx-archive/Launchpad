"use client";

import { useRef } from "react";
import { ALL_ACCEPTED_EXTENSIONS } from "@/lib/file-routing";

interface ChatAttachmentButtonProps {
  onFileSelect: (files: File[]) => void;
  disabled?: boolean;
}

export default function ChatAttachmentButton({
  onFileSelect,
  disabled = false,
}: ChatAttachmentButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(Array.from(e.target.files));
      // Reset so re-selecting the same file triggers onChange
      e.target.value = "";
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && inputRef.current?.click()}
        disabled={disabled}
        aria-label="Attach file"
        className="flex items-center justify-center text-text-muted/70 hover:text-accent transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 p-1.5 -ml-1.5"
        style={{ touchAction: "manipulation" }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M7 1v12M1 7h12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALL_ACCEPTED_EXTENSIONS}
        onChange={handleChange}
        disabled={disabled}
        className="hidden"
        aria-hidden="true"
      />
    </>
  );
}
