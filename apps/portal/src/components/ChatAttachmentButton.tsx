"use client";

import { useRef } from "react";

const ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
].join(",");

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
        className="w-6 h-6 flex items-center justify-center text-text-muted/40 hover:text-accent transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
        style={{ touchAction: "manipulation", minWidth: 44, minHeight: 44, padding: 10 }}
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
        accept={ACCEPTED_TYPES}
        onChange={handleChange}
        disabled={disabled}
        className="hidden"
        aria-hidden="true"
      />
    </>
  );
}
