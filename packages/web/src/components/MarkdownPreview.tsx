"use client";

import { useEffect, useState } from "react";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

interface MarkdownPreviewProps {
  content: string | Promise<string>;
  className?: string;
}

async function resolveContent(content: string | Promise<string>): Promise<string> {
  if (!content) return "";
  return typeof content === "string" ? content : await content;
}

export default function MarkdownPreview({ content, className = "" }: MarkdownPreviewProps) {
  const [html, setHtml] = useState<string>("");

  useEffect(() => {
    resolveContent(content).then(async (resolved) => {
      const parsed = await marked.parse(resolved);
      const sanitized = sanitizeHtml(parsed as string, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([
          "img",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "pre",
          "code",
          "table",
          "thead",
          "tbody",
          "tr",
          "th",
          "td",
        ]),
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          img: ["src", "alt", "title"],
          a: ["href", "name", "target", "rel"],
          code: ["class"],
        },
      });
      setHtml(sanitized);
    });
  }, [content]);

  return (
    <div
      className={`prose prose-sm dark:prose-invert max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
