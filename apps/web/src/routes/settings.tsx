import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTheme } from "../hooks/use-theme";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [ownerToken] = useState(() => {
    if (typeof window === "undefined") return "";
    let token = localStorage.getItem("relay-owner-token");
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem("relay-owner-token", token);
    }
    return token;
  });
  const [copied, setCopied] = useState(false);
  const [copiedStep, setCopiedStep] = useState<number | null>(null);

  const copyToken = () => {
    navigator.clipboard.writeText(ownerToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyText = (text: string, step: number) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedStep(step);
    setTimeout(() => setCopiedStep(null), 2000);
  };

  const isWindows =
    typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("win");
  const installCommand = isWindows
    ? "irm https://code.stoff.dev/install.ps1 | iex"
    : "curl -fsSL https://code.stoff.dev/install.sh | sh";

  const steps = [
    {
      label: "Install",
      description: isWindows ? "For Windows" : "Auto-detects your platform",
      command: installCommand,
    },
    {
      label: "Connect",
      description: "Link the agent to your account",
      command: `relay setup --token ${ownerToken}`,
    },
    {
      label: "Start",
      description: "Run the agent in your project directory",
      command: "relay start",
    },
  ];

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
            <h2 className="text-[14px] font-semibold text-foreground mb-4">Agent Setup</h2>
            <p className="text-[12px] text-muted mb-4">
              The agent runs on your machine and gives Relay access to your files, terminal, and
              codebase. Follow these steps to get it connected.
            </p>
            <div className="space-y-3 mb-6">
              {steps.map((step, i) => (
                <div key={step.label}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono font-medium text-accent w-4 text-right">
                      {i + 1}
                    </span>
                    <span className="text-[12px] font-medium text-body">{step.label}</span>
                    <span className="text-[11px] text-dim">{step.description}</span>
                  </div>
                  <div className="ml-6">
                    <div className="flex items-center gap-1.5">
                      <code className="flex-1 text-[11px] font-mono px-2.5 py-1.5 bg-surface-hover border border-border-subtle rounded-[4px] text-muted overflow-x-auto whitespace-nowrap">
                        {step.command}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyText(step.command, i)}
                        className="shrink-0 text-[10px] font-mono px-2 py-1.5 text-dim hover:text-muted transition-colors"
                      >
                        {copiedStep === i ? "✓" : "copy"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-[14px] font-semibold text-foreground mb-4">Account</h2>
            <div className="space-y-3">
              <div>
                <p className="text-[13px] text-body mb-1">Owner Token</p>
                <p className="text-[11px] text-muted mb-2">
                  This token links your browser to your agent. It was generated automatically when
                  you first opened Relay.
                </p>
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
