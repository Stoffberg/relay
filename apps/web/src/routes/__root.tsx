import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import appCss from "../styles.css?url";
import { DbConnection, tables, extractTimestamp } from "../spacetime";
import type { Session } from "../spacetime";
import { SpacetimeDBProvider, useSpacetimeDB } from "spacetimedb/react";
import { ThemeProvider } from "../hooks/use-theme";
import { Sidebar, type SessionPreview } from "../components/sidebar";
import { ToastContainer } from "../components/toast";
import { useRows, useSubscriptionReady, markSubscriptionReady } from "../hooks/use-rows";
const CommandPalette = React.lazy(() => import("../components/command-palette").then(m => ({ default: m.CommandPalette })));

const SPACETIME_URL = import.meta.env.VITE_SPACETIME_URL || "wss://maincloud.spacetimedb.com";
const SPACETIME_DB_NAME = import.meta.env.VITE_SPACETIME_DB_NAME || "relay";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Relay" },
      { name: "theme-color", content: "#111111" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,300..900;1,300..900&family=JetBrains+Mono:ital,wght@0,300;0,400;0,500;1,300;1,400&display=swap" },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>" },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  component: RootComponent,
  shellComponent: RootShell,
});

const themeScript = `(function(){try{var t=localStorage.getItem("relay-theme");if(t==="light")document.documentElement.classList.add("light");else if(!t&&window.matchMedia("(prefers-color-scheme: light)").matches)document.documentElement.classList.add("light")}catch(e){}})()`;

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const connectionBuilder = DbConnection.builder()
  .withUri(SPACETIME_URL)
  .withDatabaseName(SPACETIME_DB_NAME)
  .onConnect((conn, identity, token) => {
    console.log("[relay] connected:", identity.toHexString());
    if (token) {
      localStorage.setItem("spacetimedb-token", token);
    }
    conn.subscriptionBuilder()
      .onApplied(() => {
        console.log("[relay] base subscriptions applied");
        markSubscriptionReady();
      })
      .subscribe([
        "SELECT * FROM session",
        "SELECT * FROM agent",
      ]);
  })
  .onConnectError((_ctx, error) => {
    console.error("[relay] connection error:", error);
  })
  .onDisconnect((_ctx, error) => {
    console.warn("[relay] disconnected:", error ?? "clean");
  });

function RootComponent() {
  return (
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <ThemeProvider>
        <RootInner />
      </ThemeProvider>
    </SpacetimeDBProvider>
  );
}

function buildSessionPreview(session: Session): SessionPreview {
  return {
    id: session.id,
    title: session.title || "New chat",
    status: session.status as SessionPreview["status"],
    createdAt: extractTimestamp(session.createdAt),
    updatedAt: extractTimestamp(session.updatedAt),
    messageCount: 0,
    lastMessage: undefined,
    isArchived: session.isArchived ?? false,
    model: session.model ?? undefined,
  };
}

function RootInner() {
  const { isActive } = useSpacetimeDB();
  const subscriptionReady = useSubscriptionReady();
  const allSessions = useRows<Session>(tables.session);
  const allAgents = useRows<{ id: string; status: string; ownerToken: string }>(tables.agent);

  const connState = isActive && subscriptionReady ? "connected" : "connecting";

  const [ownerToken] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("relay-owner-token") || "";
  });

  const sessions = useMemo(() => {
    const previews = (allSessions as Session[]).map(buildSessionPreview);
    previews.sort((a, b) => b.updatedAt - a.updatedAt);
    return previews;
  }, [allSessions]);

  const hasOnlineAgent = useMemo(() => allAgents.some(a => a.status === "online" && a.ownerToken === ownerToken), [allAgents, ownerToken]);

  const [showCmd, setShowCmd] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("relay-sidebar-collapsed") === "true";
  });
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem("relay-sidebar-collapsed", String(next));
      return next;
    });
  }, []);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  const navigate = useNavigate();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const activeSessionId = currentPath.startsWith("/chat/") ? currentPath.replace("/chat/", "") : null;
  const hasChatOpen = activeSessionId !== null;
  const isFullscreenRoute = currentPath === "/settings";

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || "http://localhost:3000"}/health`).catch(() => {});
  }, []);

  const showCmdRef = useRef(showCmd);
  showCmdRef.current = showCmd;

  const startNewChat = useCallback(() => {
    const id = crypto.randomUUID();
    navigate({ to: "/chat/$sessionId", params: { sessionId: id } });
  }, [navigate]);

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
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggleSidebar();
      }
      if (e.key === "Escape" && showCmdRef.current) {
        setShowCmd(false);
      }
    }
    function onToggleSidebar() { toggleSidebar(); }
    window.addEventListener("keydown", onKey);
    window.addEventListener("relay:toggle-sidebar", onToggleSidebar);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("relay:toggle-sidebar", onToggleSidebar);
    };
  }, [startNewChat, toggleSidebar]);

  function selectChat(sessionId: string) {
    navigate({ to: "/chat/$sessionId", params: { sessionId } });
  }

  return (
    <>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-3 focus:py-2 focus:bg-surface focus:text-foreground focus:rounded-md">
        Skip to content
      </a>
      <div className="flex h-screen overflow-hidden bg-background text-foreground font-sans">
        {!isFullscreenRoute && (!isMobile || !hasChatOpen) && <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          connState={connState}
          hasChatOpen={hasChatOpen}
          hasOnlineAgent={hasOnlineAgent}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          onSelectChat={selectChat}
          onNewChat={startNewChat}
        />}
        {(!isMobile || hasChatOpen || isFullscreenRoute) && <main id="main-content" className="flex-1 flex flex-col min-w-0">
          <Outlet />
        </main>}
        {showCmd && (
          <Suspense fallback={null}>
            <CommandPalette
              sessions={sessions}
              onSelectChat={(id) => { selectChat(id); setShowCmd(false); }}
              onNewChat={() => { startNewChat(); setShowCmd(false); }}
              onSettings={() => { navigate({ to: "/settings" }); setShowCmd(false); }}
              onClose={() => setShowCmd(false)}
            />
          </Suspense>
        )}
        <ToastContainer />
      </div>
    </>
  );
}
