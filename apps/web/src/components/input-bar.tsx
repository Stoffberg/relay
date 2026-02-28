import { useCallback, useRef } from "react";

interface InputBarProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  disabled: boolean;
  showThinking: boolean;
  ready: boolean;
  sessionId: string;
  sessionStatus: string;
}

export function InputBar({
  input,
  onInputChange,
  onSend,
  onStop,
  disabled,
  showThinking,
  ready,
  sessionId,
  sessionStatus,
}: InputBarProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const setRef = useCallback((el: HTMLTextAreaElement | null) => {
    (inputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    if (el) requestAnimationFrame(() => el.focus());
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onInputChange(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSend();
    }
  }

  return (
    <div className="shrink-0 px-3 py-2 md:px-5 md:py-3 border-t border-border">
        <div className="max-w-[1060px] mx-auto">
        <div className="flex items-end gap-2 bg-surface border border-border rounded-[8px] px-[14px] py-[10px]">
          <textarea
            key={sessionId}
            ref={setRef}
            data-chat-input
            aria-label="Message input"
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={!ready ? "Connecting..." : showThinking ? "Send another message..." : "Message..."}
            disabled={disabled}
            maxLength={100000}
            rows={1}
            className="flex-1 text-[14px] resize-none bg-transparent text-foreground caret-accent placeholder:text-muted disabled:opacity-40"
          />
          <div className="flex items-center gap-1.5 shrink-0 pb-0.5">
            {sessionStatus === "streaming" || sessionStatus === "waiting_for_tool" ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop generation"
                className="transition-all text-danger hover:text-danger/80"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="3" width="10" height="10" rx="1" fill="currentColor" />
                </svg>
              </button>
            ) : (
              <>
                {input.trim() && (
                  <span className="text-[10px] font-mono text-dim animate-fade-in">↵</span>
                )}
                <button
                  type="button"
                  onClick={onSend}
                  disabled={!input.trim() || disabled}
                  aria-label="Send message"
                  className="transition-all text-accent disabled:opacity-40"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
        {showThinking && (
          <div className="mt-1.5 px-1">
            <span className="text-[10px] font-mono text-muted animate-pulse-soft">thinking...</span>
          </div>
        )}
      </div>
    </div>
  );
}
