import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { isSpacetimeReady, subscribeToSpacetimeState } from "../spacetime";
import { ChatSessionStore } from "../lib/chat-store";
import { MessageRow, ThinkingIndicator } from "../components/message-row";
import { InputBar } from "../components/input-bar";

const API_URL = import.meta.env.VITE_API_URL;

export const Route = createFileRoute("/chat/$sessionId")({
  component: ChatPage,
});

function ChatPage() {
  const { sessionId } = Route.useParams();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const userNearBottomRef = useRef(true);

  const ready = useSyncExternalStore(subscribeToSpacetimeState, isSpacetimeReady);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    if (!force && !userNearBottomRef.current) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }, []);

  const storeRef = useRef<ChatSessionStore | null>(null);
  if (!storeRef.current || storeRef.current.sessionId !== sessionId) {
    storeRef.current?.destroy();
    storeRef.current = new ChatSessionStore(sessionId, scrollToBottom);
  }
  const store = storeRef.current;

  const messageIds = useSyncExternalStore(store.subscribeToList, store.getListSnapshot);
  const { showThinking, sessionStatus } = useSyncExternalStore(store.subscribeToStatus, store.getStatusSnapshot);

  useEffect(() => () => { storeRef.current?.destroy(); }, []);

  const virtualizer = useVirtualizer({
    count: messageIds.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 60,
    overscan: 5,
  });

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    const userMsgId = crypto.randomUUID();
    setInput("");

    store.addOptimisticMessage({
      id: userMsgId,
      role: "user",
      content: text,
      status: "optimistic",
    });
    userNearBottomRef.current = true;
    scrollToBottom(true);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          session_id: sessionId,
          user_message_id: userMsgId,
        }),
      });
      const data = (await res.json()) as { error?: string };

      if (data.error) {
        store.resolveOptimistic(userMsgId);
        store.addErrorMessage({
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${data.error}`,
          status: "error",
        });
      }
    } catch (err) {
      store.resolveOptimistic(userMsgId);
      store.addErrorMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Network error: ${String(err)}`,
        status: "error",
      });
    }
  }, [input, store, sessionId, scrollToBottom]);

  if (!ready) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[13px] text-muted">Loading conversation...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={() => { userNearBottomRef.current = isNearBottom(); }}
      >
        <div className="max-w-[1060px] mx-auto px-6 py-6">
          {messageIds.length === 0 && !showThinking && <EmptyState onSuggestion={setInput} />}

          {messageIds.length > 0 && (
            <div
              style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative", width: "100%" }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => (
                <div
                  key={messageIds[virtualRow.index]}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="mb-6">
                    <MessageRow id={messageIds[virtualRow.index]} store={store} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {showThinking && <ThinkingIndicator />}

          {sessionStatus === "waiting_for_tool" && (
            <div className="pl-[18px] animate-fade-in">
              <div className="flex gap-2 items-center pl-4">
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                <span className="text-[12px] font-mono text-muted">running tools...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <InputBar
        input={input}
        onInputChange={setInput}
        onSend={sendMessage}
        disabled={!ready}
        showThinking={showThinking}
        ready={ready}
        sessionId={sessionId}
      />
    </div>
  );
}

function EmptyState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  const suggestions = [
    "What languages do you know?",
    "Write a fizzbuzz in Rust",
    "Explain async/await",
  ];

  return (
    <div className="text-center py-16 sm:py-20 animate-fade-in">
      <div className="text-[40px] font-bold mb-4 text-foreground tracking-[-0.03em]">
        Relay
      </div>
      <p className="text-muted mb-6 text-[13px]">What can I help you with?</p>
      <div className="flex flex-wrap gap-2 justify-center">
        {suggestions.map((s) => (
          <button
            type="button"
            key={s}
            onClick={() => onSuggestion(s)}
            className="text-[12px] px-3 py-1.5 rounded-[4px] border border-border text-body hover:text-foreground hover:border-muted transition-colors font-mono"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
