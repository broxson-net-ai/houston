"use client";

import { useState } from "react";

type Props = {
  data: Record<string, unknown> | unknown;
  initialExpanded?: boolean;
};

export function JsonViewer({ data, initialExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [copied, setCopied] = useState(false);

  const json = JSON.stringify(data, null, 2);

  function copy() {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="rounded border bg-muted/40 text-xs font-mono overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/60">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground hover:text-primary transition-colors"
        >
          {expanded ? "▾ collapse" : "▸ expand"}
        </button>
        <button
          onClick={copy}
          className="text-muted-foreground hover:text-primary transition-colors"
        >
          {copied ? "✓ copied" : "copy"}
        </button>
      </div>
      {expanded && (
        <pre className="p-3 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-64 overflow-y-auto">
          {json}
        </pre>
      )}
    </div>
  );
}
