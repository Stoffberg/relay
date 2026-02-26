export interface Theme {
  bg: string;
  surface: string;
  surfaceHover: string;
  surfaceActive: string;
  border: string;
  borderSubtle: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textDim: string;
  textDimmer: string;
  textGhost: string;
  caret: string;
  inputBg: string;
  cmdBg: string;
  cmdBorder: string;
  overlay: string;
  accentBg: string;
  accentText: string;
  dangerBg: string;
  dangerText: string;
  questionBg: string;
  questionBorder: string;
  questionText: string;
}

export const dark: Theme = {
  bg: "#09090B",
  surface: "#111114",
  surfaceHover: "rgba(255,255,255,0.02)",
  surfaceActive: "rgba(255,255,255,0.035)",
  border: "#1A1A1E",
  borderSubtle: "#111114",
  text: "#D4D4D8",
  textSecondary: "#A1A1AA",
  textMuted: "#71717A",
  textDim: "#52525B",
  textDimmer: "#3F3F46",
  textGhost: "#27272A",
  caret: "#52525B",
  inputBg: "rgba(255,255,255,0.025)",
  cmdBg: "#18181B",
  cmdBorder: "#27272A",
  overlay: "rgba(0,0,0,0.6)",
  accentBg: "rgba(59,130,246,0.06)",
  accentText: "#3B82F6",
  dangerBg: "rgba(239,68,68,0.06)",
  dangerText: "#FCA5A5",
  questionBg: "rgba(251,191,36,0.04)",
  questionBorder: "rgba(251,191,36,0.1)",
  questionText: "#FBBF24",
};

export const light: Theme = {
  bg: "#F7F7F5",
  surface: "#FFFFFF",
  surfaceHover: "rgba(0,0,0,0.015)",
  surfaceActive: "rgba(0,0,0,0.035)",
  border: "#E5E5E5",
  borderSubtle: "#F0F0F0",
  text: "#171717",
  textSecondary: "#525252",
  textMuted: "#737373",
  textDim: "#A3A3A3",
  textDimmer: "#D4D4D4",
  textGhost: "#E5E5E5",
  caret: "#A3A3A3",
  inputBg: "#FFFFFF",
  cmdBg: "#FFFFFF",
  cmdBorder: "#E5E5E5",
  overlay: "rgba(0,0,0,0.25)",
  accentBg: "rgba(59,130,246,0.06)",
  accentText: "#2563EB",
  dangerBg: "rgba(239,68,68,0.06)",
  dangerText: "#DC2626",
  questionBg: "rgba(245,158,11,0.05)",
  questionBorder: "rgba(245,158,11,0.15)",
  questionText: "#B45309",
};
