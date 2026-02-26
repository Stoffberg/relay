import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import appCss from "../styles.css?url";
import {
  addListener,
  connectToSpacetime,
  disconnect,
  getConnectionState,
  getSessionsFromCache,
  getMessagesForSession,
  getAgentsFromCache,
  type ConnectionState,
  type Session,
} from "../spacetime";
import { ThemeProvider } from "../hooks/use-theme";
import { Sidebar, type SessionPreview } from "../components/sidebar";
import { CommandPalette } from "../components/command-palette";

const SPACETIME_URL = import.meta.env.VITE_SPACETIME_URL || "wss://maincloud.spacetimedb.com";
const SPACETIME_DB_NAME = import.meta.env.VITE_SPACETIME_DB_NAME || "relay";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Relay" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
  shellComponent: RootShell,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function buildSessionPreview(session: Session): SessionPreview {
  const messages = getMessagesForSession(session.id);

  return {
    id: session.id,
    title: session.title || "New chat",
    status: session.status as SessionPreview["status"],
    createdAt: session.createdAt instanceof Date ? session.createdAt.getTime() : Number(session.createdAt),
    updatedAt: session.updatedAt instanceof Date ? session.updatedAt.getTime() : Number(session.updatedAt),
    messageCount: messages.length,
  };
}

function RootComponent() {
  const [connState, setConnState] = useState<ConnectionState>(getConnectionState);
  const [sessions, setSessions] = useState<SessionPreview[]>([]);
  const [hasOnlineAgent, setHasOnlineAgent] = useState(false);
  const [showCmd, setShowCmd] = useState(false);
  const navigate = useNavigate();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const activeSessionId = currentPath.startsWith("/chat/") ? currentPath.replace("/chat/", "") : null;
  const hasChatOpen = activeSessionId !== null;

  const refreshSessions = useCallback(() => {
    const cached = getSessionsFromCache();
    const previews = cached.map(buildSessionPreview);
    previews.sort((a, b) => b.updatedAt - a.updatedAt);
    setSessions(previews);
  }, []);

  const refreshAgents = useCallback(() => {
    const agents = getAgentsFromCache();
    setHasOnlineAgent(agents.some((a) => a.status === "online"));
  }, []);

  useEffect(() => {
    connectToSpacetime(SPACETIME_URL, SPACETIME_DB_NAME);
    const remove = addListener({
      onConnectionChange: (state) => setConnState(state),
      onSubscriptionApplied: () => {
        refreshSessions();
        refreshAgents();
      },
      onSessionInsert: () => refreshSessions(),
      onSessionUpdate: () => refreshSessions(),
      onMessageInsert: () => refreshSessions(),
      onAgentInsert: () => refreshAgents(),
      onAgentUpdate: () => refreshAgents(),
    });
    return () => {
      remove();
      disconnect();
    };
  }, [refreshSessions, refreshAgents]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowCmd(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        startNewChat();
      }
      if (e.key === "Escape" && showCmd) {
        setShowCmd(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showCmd]);

  function startNewChat() {
    const id = crypto.randomUUID();
    navigate({ to: "/chat/$sessionId", params: { sessionId: id } });
  }

  function selectChat(sessionId: string) {
    navigate({ to: "/chat/$sessionId", params: { sessionId } });
  }

  return (
    <ThemeProvider>
      <div className="flex h-screen overflow-hidden bg-background text-foreground font-sans">
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          connState={connState}
          hasChatOpen={hasChatOpen}
          hasOnlineAgent={hasOnlineAgent}
          onSelectChat={selectChat}
          onNewChat={startNewChat}
          onOpenCmd={() => setShowCmd(true)}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <Outlet />
        </div>
        {showCmd && (
          <CommandPalette
            sessions={sessions}
            onSelectChat={(id) => { selectChat(id); setShowCmd(false); }}
            onNewChat={() => { startNewChat(); setShowCmd(false); }}
            onClose={() => setShowCmd(false)}
          />
        )}
      </div>
    </ThemeProvider>
  );
}
