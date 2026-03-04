"use client";

import { useMemo } from "react";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export default function MarkdownPreview({ content, className = "" }: MarkdownPreviewProps) {
  const html = useMemo(() => {
    if (!content) return "";
    const parsed = marked.parse(content);
    return sanitizeHtml(parsed, {
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
  }, [content]);

  return (
    <div
      className={`prose prose-sm dark:prose-invert max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
