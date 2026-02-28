import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTheme } from "../hooks/use-theme";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [ownerToken, setOwnerToken] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("relay-owner-token");
    if (!token) {
      const newToken = crypto.randomUUID();
      localStorage.setItem("relay-owner-token", newToken);
      setOwnerToken(newToken);
    } else {
      setOwnerToken(token);
    }
  }, []);

  const copyToken = () => {
    navigator.clipboard.writeText(ownerToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center justify-between">
        <h1 className="text-[18px] font-semibold text-foreground">Settings</h1>
        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          className="text-[12px] font-mono text-muted hover:text-foreground transition-colors"
          aria-label="Close settings"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[600px] mx-auto px-6 py-8 space-y-8">
          <section>
            <h2 className="text-[14px] font-semibold text-foreground mb-4">Appearance</h2>
            <div className="flex items-center justify-between py-3 border-b border-border-subtle">
              <div>
                <p className="text-[13px] text-body">Theme</p>
                <p className="text-[11px] text-muted mt-0.5">Switch between dark and light mode</p>
              </div>
              <button
                type="button"
                onClick={toggle}
                className="text-[12px] px-3 py-1.5 font-mono text-body border border-border rounded-[6px] hover:bg-surface-hover transition-colors"
              >
                {theme === "dark" ? "Dark" : "Light"}
              </button>
            </div>
          </section>
          <section>
            <h2 className="text-[14px] font-semibold text-foreground mb-4">Agent</h2>
            <div className="space-y-3">
              <div>
                <p className="text-[13px] text-body mb-2">Owner Token</p>
                <p className="text-[11px] text-muted mb-3">Use this token when setting up your local agent with `relay setup`</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-surface-hover border border-border rounded-[6px] text-[11px] font-mono text-muted overflow-x-auto whitespace-nowrap">
                    {ownerToken}
                  </code>
                  <button
                    type="button"
                    onClick={copyToken}
                    className="shrink-0 text-[12px] px-3 py-2 font-mono text-body border border-border rounded-[6px] hover:bg-surface-hover transition-colors"
                  >
                    {copied ? "✓" : "Copy"}
                  </button>
                </div>
              </div>
            </div>
          </section>
          <section>
            <h2 className="text-[14px] font-semibold text-foreground mb-4">About</h2>
            <div className="space-y-2 text-[12px] font-mono text-muted">
              <p>Relay v1.0</p>
              <p>AI chat with local agent tools</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
