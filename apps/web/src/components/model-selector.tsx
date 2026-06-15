import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useSpacetimeDB } from "spacetimedb/react";
import type { DbConnection } from "../spacetime";

const MODELS = [
  { id: "minimax/minimax-m2.5:nitro", label: "MiniMax M2.5" },
  { id: "z-ai/glm-5:nitro", label: "GLM 5" },
  { id: "moonshotai/kimi-k2.5:nitro", label: "Kimi K2.5" },
  { id: "x-ai/grok-4.1-fast", label: "Grok 4.1 Fast" },
  { id: "deepseek/deepseek-v3.2:nitro", label: "DeepSeek V3.2" },
  { id: "google/gemini-3-flash-preview:nitro", label: "Gemini 3 Flash" },
];

const DEFAULT_MODEL = "minimax/minimax-m2.5:nitro";

interface ModelSelectorProps {
  sessionId: string;
  currentModel: string | null | undefined;
}

export const ModelSelector = memo(function ModelSelector({
  sessionId,
  currentModel,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { getConnection } = useSpacetimeDB();

  const displayModel = currentModel || DEFAULT_MODEL;
  const shortLabel =
    MODELS.find((m) => m.id === displayModel)?.label || displayModel.split("/").pop() || "model";

  const selectModel = useCallback(
    (modelId: string) => {
      const conn = getConnection() as DbConnection | null;
      if (!conn) return;
      const value = modelId === DEFAULT_MODEL ? undefined : modelId;
      conn.reducers.updateSessionModel({ sessionId, model: value });
      setOpen(false);
    },
    [sessionId, getConnection]
  );

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="text-[10px] font-mono text-dim hover:text-muted transition-colors flex items-center gap-1"
        aria-label="Select model"
      >
        {shortLabel}
        <svg aria-hidden="true" width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path
            d="M2 3l2 2 2-2"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 py-1 min-w-[200px] bg-cmd border border-border rounded-[6px] animate-scale-in"
          style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}
        >
          {MODELS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => selectModel(m.id)}
              className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors ${m.id === displayModel ? "text-accent bg-accent/5" : "text-body hover:bg-surface-hover"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
