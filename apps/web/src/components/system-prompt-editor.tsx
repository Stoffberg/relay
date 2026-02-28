import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useSpacetimeDB } from "spacetimedb/react";
import type { DbConnection } from "../spacetime";

interface SystemPromptEditorProps {
  sessionId: string;
  currentPrompt: string | null | undefined;
  onClose: () => void;
}

export const SystemPromptEditor = memo(function SystemPromptEditor({ sessionId, currentPrompt, onClose }: SystemPromptEditorProps) {
  const [value, setValue] = useState(currentPrompt || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { getConnection } = useSpacetimeDB();

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const save = useCallback(() => {
    const conn = getConnection() as DbConnection | null;
    if (!conn) return;
    const prompt = value.trim() || undefined;
    conn.reducers.updateSessionSystemPrompt({ sessionId, systemPrompt: prompt });
    onClose();
  }, [sessionId, value, getConnection, onClose]);

  const clear = useCallback(() => {
    const conn = getConnection() as DbConnection | null;
    if (!conn) return;
    conn.reducers.updateSessionSystemPrompt({ sessionId, systemPrompt: undefined });
    setValue("");
    onClose();
  }, [sessionId, getConnection, onClose]);

  return (
    <div className="shrink-0 px-3 md:px-6 py-3 border-b border-border bg-surface/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-mono text-muted">Custom system prompt (appended to default)</span>
        <div className="flex items-center gap-2">
          {currentPrompt && (
            <button type="button" onClick={clear} className="text-[10px] font-mono text-danger hover:text-danger/80 transition-colors">Clear</button>
          )}
          <button type="button" onClick={onClose} className="text-[10px] font-mono text-dim hover:text-muted transition-colors">Cancel</button>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
          if (e.key === "Escape") onClose();
        }}
        placeholder="e.g. Always respond in bullet points. Use TypeScript for code examples."
        rows={3}
        className="w-full text-[13px] bg-transparent text-body placeholder:text-dim resize-none focus:outline-none caret-accent"
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-[9px] font-mono text-dim">{navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+Enter to save</span>
        <button
          type="button"
          onClick={save}
          className="text-[11px] font-medium px-3 py-1 rounded-[4px] bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
});
