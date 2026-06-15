"use client";

import { useRef, useState } from "react";

interface FileUploadProps {
  accept?: string;
  label?: string;
  hint?: string;
  onChange?: (file: File | null) => void;
}

export default function FileUpload({
  accept = ".pdf,.jpg,.jpeg,.png",
  label = "Drag & drop your file here",
  hint = "PDF, JPG, PNG (Max 10 MB)",
  onChange,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = (file: File | null) => {
    setFileName(file ? file.name : null);
    onChange?.(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0] ?? null;
    handleFile(file);
  };

  return (
    <label
      className={`upload-box${dragging ? " dragging" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      aria-label="File upload area"
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        aria-label="Choose file to upload"
      />
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M14 2H6C4.9 2 4 2.9 4 4v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8L14 2Z" stroke="#f26f21" strokeWidth="2" />
        <path d="M14 2v6h6M12 18v-6M9.5 14.5L12 12l2.5 2.5" stroke="#f26f21" strokeWidth="2" />
      </svg>
      {fileName ? (
        <span style={{ fontWeight: 600, color: "#0f2b50", fontSize: "14px" }}>{fileName}</span>
      ) : (
        <>
          <strong>{label}</strong>
          <span style={{ fontSize: "13px", color: "#666" }}>
            or <span style={{ color: "#f26f21" }}>browse</span> to upload
          </span>
        </>
      )}
      <small style={{ color: "#aaa" }}>{hint}</small>
    </label>
  );
}
