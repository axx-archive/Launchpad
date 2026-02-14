"use client";

import type { Department } from "@/types/database";

const DEPT_THEME: Record<
  Department,
  {
    accent: string;
    accentLight: string;
    accentDim: string;
    glow: string;
  }
> = {
  intelligence: {
    accent: "#4D8EFF",
    accentLight: "#7DAAFF",
    accentDim: "rgba(77, 142, 255, 0.12)",
    glow: "rgba(77, 142, 255, 0.06)",
  },
  strategy: {
    accent: "#8B9A6B",
    accentLight: "#A8B88A",
    accentDim: "rgba(139, 154, 107, 0.12)",
    glow: "rgba(139, 154, 107, 0.06)",
  },
  creative: {
    accent: "#c07840",
    accentLight: "#e0a870",
    accentDim: "rgba(192, 120, 64, 0.12)",
    glow: "rgba(192, 120, 64, 0.06)",
  },
};

interface StudioLayoutProps {
  department: Department;
  children: React.ReactNode;
}

export default function StudioLayout({
  department,
  children,
}: StudioLayoutProps) {
  const theme = DEPT_THEME[department];

  return (
    <div
      className="min-h-screen relative"
      style={
        {
          "--dept-accent": theme.accent,
          "--dept-accent-light": theme.accentLight,
          "--dept-accent-dim": theme.accentDim,
          "--dept-glow": theme.glow,
        } as React.CSSProperties
      }
    >
      {/* Department accent top border */}
      <div
        className="fixed top-0 left-0 right-0 h-px z-[51]"
        style={{ backgroundColor: theme.accent, opacity: 0.3 }}
      />
      {children}
    </div>
  );
}
