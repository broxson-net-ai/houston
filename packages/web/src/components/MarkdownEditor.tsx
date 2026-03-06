"use client";

import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

interface MarkdownEditorProps {
  slug: string;
  doc: string;
  initialContent: string;
  onClose: () => void;
  onSave: (content: string) => Promise<void>;
  title: string;
}

export default function MarkdownEditor({
  slug,
  doc,
  initialContent,
  onClose,
  onSave,
  title,
}: MarkdownEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [showConflictWarning, setShowConflictWarning] = useState(false);

  // Auto-save to localStorage every 30 seconds
  const autoSaveInterval = useRef<NodeJS.Timeout>();
  const localStorageKey = `markdown-draft-${slug}-${doc}`;

  useEffect(() => {
    // Load draft from localStorage if exists
    const savedDraft = localStorage.getItem(localStorageKey);
    if (savedDraft && savedDraft !== initialContent) {
      setContent(savedDraft);
    }

    // Setup auto-save to localStorage
    autoSaveInterval.current = setInterval(() => {
      localStorage.setItem(localStorageKey, content);
    }, 30000);

    return () => {
      if (autoSaveInterval.current) {
        clearInterval(autoSaveInterval.current);
      }
    };
  }, [localStorageKey, initialContent]);

  useEffect(() => {
    const updatePreview = async () => {
      const parsed = await marked.parse(content);
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
      setPreviewHtml(sanitized);
    };

    updatePreview();
  }, [content]);

  async function handleSave() {
    setIsSaving(true);
    setSaveError("");
    setShowConflictWarning(false);

    try {
      await onSave(content);
      // Clear draft after successful save
      localStorage.removeItem(localStorageKey);
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to save";
      if (errorMessage.includes("conflict") || errorMessage.includes("modified")) {
        setShowConflictWarning(true);
      }
      setSaveError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    const hasUnsavedChanges = content !== initialContent;
    const draftInStorage = localStorage.getItem(localStorageKey);

    if (hasUnsavedChanges || draftInStorage) {
      const shouldDiscard = confirm(
        "You have unsaved changes. Are you sure you want to close without saving?"
      );
      if (!shouldDiscard) return;
    }

    localStorage.removeItem(localStorageKey);
    onClose();
  }

  function handleDiscardDraft() {
    localStorage.removeItem(localStorageKey);
    setContent(initialContent);
    setShowConflictWarning(false);
    setSaveError("");
  }

  function handleReloadFromDisk() {
    setContent(initialContent);
    localStorage.removeItem(localStorageKey);
    setShowConflictWarning(false);
    setSaveError("");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-mono">{title}</h2>
          <p className="text-sm text-muted-foreground font-mono">
            {slug} / {title}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSaving}
            className="rounded-md border px-3 py-1 text-sm hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <p className="font-semibold">{saveError}</p>
          {showConflictWarning && (
            <div className="mt-2 space-x-2">
              <button
                type="button"
                onClick={handleReloadFromDisk}
                className="rounded border border-red-300 bg-red-100 px-2 py-1 text-xs hover:bg-red-200 dark:border-red-700 dark:bg-red-900 dark:hover:bg-red-800"
              >
                Reload from disk
              </button>
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="rounded border border-red-300 bg-red-100 px-2 py-1 text-xs hover:bg-red-200 dark:border-red-700 dark:bg-red-900 dark:hover:bg-red-800"
              >
                Discard draft
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="editor" className="text-sm font-medium">
            Editor
          </label>
          <textarea
            id="editor"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="h-[600px] w-full rounded-md border bg-background p-4 font-mono text-sm"
            spellCheck={false}
            placeholder="Write Markdown here..."
          />
          <p className="text-xs text-muted-foreground">
            Auto-saves to localStorage every 30 seconds. Press Save to write to disk.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="preview" className="text-sm font-medium">
            Preview
          </label>
          <div
            id="preview"
            className="h-[600px] w-full overflow-auto rounded-md border bg-background p-4 prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      </div>
    </div>
  );
}
