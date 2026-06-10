import type { ReactNode } from "react";

interface TitleBarProps {
  title: string;
}

/**
 * Custom window title bar. The native macOS title bar is hidden
 * (titleBarStyle: "hidden" in the main process) while the traffic
 * lights remain; this bar fills its place and matches the theme
 * background. The left padding reserves room for the traffic lights.
 */
export function TitleBar({ title }: TitleBarProps): ReactNode {
  return (
    <div
      className="titlebar-drag relative flex items-center shrink-0 select-none"
      style={{
        height: "var(--title-bar-height)",
        background: "var(--bg)",
        borderBottom: "1px solid var(--sidebar-border)",
      }}
    >
      <span
        className="absolute left-1/2 -translate-x-1/2 max-w-[60%] overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium"
        style={{ color: "var(--tab-text)" }}
      >
        {title}
      </span>
    </div>
  );
}
