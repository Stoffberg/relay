import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({ component: IndexPage });

function IndexPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({
      to: "/chat/$sessionId",
      params: { sessionId: crypto.randomUUID() },
      replace: true,
    });
  }, [navigate]);

  return (
    <div className="flex items-center justify-center h-full animate-fade-in">
      <div className="text-center">
        <div className="text-[40px] font-bold mb-3 text-foreground tracking-[-0.03em]">Relay</div>
        <p className="text-muted text-[13px]">Starting a new chat...</p>
      </div>
    </div>
  );
}
