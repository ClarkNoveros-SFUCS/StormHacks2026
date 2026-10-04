// Pure file helpers, safe anywhere.

/** The extension-based type, for icons and client-side checks. */
export function fileKind(filename: string): "pdf" | "pptx" | "docx" | "other" {
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return ext === "pdf" || ext === "pptx" || ext === "docx" ? ext : "other";
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
