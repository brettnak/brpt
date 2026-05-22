import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { classNames } from "../classNames";
import { palettes, paletteById, type Palette } from "../themes";
import { SegmentedControl } from "./ui-elements/SegmentedControl";

export type ThemeMode = "light" | "dark" | "system";

interface ThemePickerProps {
  mode: ThemeMode;
  lightPaletteId: string;
  darkPaletteId: string;
  systemPrefersDark: boolean;
  onChangeMode: (mode: ThemeMode) => void;
  onChangeLightPalette: (id: string) => void;
  onChangeDarkPalette: (id: string) => void;
  onClose: () => void;
}

function resolveMode(mode: ThemeMode, systemPrefersDark: boolean): "light" | "dark" {
  if (mode === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return mode;
}

function applyPalettePreview(palette: Palette): void {
  document.body.setAttribute("data-theme", palette.mode);
  document.body.setAttribute("data-palette", palette.id);
  document.documentElement.classList.toggle("dark", palette.mode === "dark");
  const hljs = document.getElementById("hljs-active") as HTMLStyleElement | null;
  if (hljs) {
    hljs.textContent = palette.hljsStylesheet;
  }
  const lightMd = document.getElementById("markdown-theme-light") as HTMLStyleElement | null;
  const darkMd = document.getElementById("markdown-theme-dark") as HTMLStyleElement | null;
  if (lightMd && darkMd) {
    if (palette.mode === "dark") {
      lightMd.disabled = true;
      darkMd.disabled = false;
    } else {
      lightMd.disabled = false;
      darkMd.disabled = true;
    }
  }
}

export function ThemePicker({
  mode,
  lightPaletteId,
  darkPaletteId,
  systemPrefersDark,
  onChangeMode,
  onChangeLightPalette,
  onChangeDarkPalette,
  onClose,
}: ThemePickerProps): ReactNode {
  const overlayRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<Palette | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const lightPalettes = palettes.filter((p) => p.mode === "light");
  const darkPalettes = palettes.filter((p) => p.mode === "dark");

  const resolvedMode = resolveMode(mode, systemPrefersDark);
  const committedPaletteId = resolvedMode === "dark" ? darkPaletteId : lightPaletteId;

  const restoreCommitted = useCallback(() => {
    const committed = paletteById(committedPaletteId);
    if (committed) {
      applyPalettePreview(committed);
    }
    previewRef.current = null;
    setPreviewing(false);
  }, [committedPaletteId]);

  useEffect(() => {
    return () => {
      restoreCommitted();
    };
  }, [restoreCommitted]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handlePreview = useCallback((palette: Palette) => {
    previewRef.current = palette;
    setPreviewing(true);
    applyPalettePreview(palette);
  }, []);

  const handlePreviewEnd = useCallback(() => {
    if (previewRef.current) {
      restoreCommitted();
    }
  }, [restoreCommitted]);

  const handleSelectLight = useCallback(
    (id: string) => {
      previewRef.current = null;
      onChangeLightPalette(id);
    },
    [onChangeLightPalette],
  );

  const handleSelectDark = useCallback(
    (id: string) => {
      previewRef.current = null;
      onChangeDarkPalette(id);
    },
    [onChangeDarkPalette],
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-start justify-center pt-16"
      style={{
        background: previewing ? "transparent" : "rgba(0,0,0,0.25)",
        transition: "background 0.15s ease",
      }}
      onClick={handleOverlayClick}
    >
      <div
        className="w-[640px] max-h-[80vh] overflow-y-auto rounded-lg shadow-2xl"
        style={{
          background: "var(--sidebar-bg)",
          border: "1px solid var(--sidebar-border)",
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-2 border-b border-[var(--sidebar-border)]"
          style={{ color: "var(--tab-active-text)" }}
        >
          <div className="text-sm font-semibold">Theme</div>
          <button
            type="button"
            onClick={onClose}
            className="border-none bg-transparent cursor-pointer text-[var(--tab-text)] hover:text-[var(--tab-active-text)] text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-4 py-3 flex items-center gap-3">
          <div className="text-[12px]" style={{ color: "var(--tab-text)" }}>Mode</div>
          <SegmentedControl<ThemeMode>
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "system", label: "System" },
            ]}
            value={mode}
            onChange={onChangeMode}
          />
          {mode === "system" && (
            <div className="text-[11px]" style={{ color: "var(--tab-text)" }}>
              Currently {systemPrefersDark ? "dark" : "light"}
            </div>
          )}
        </div>

        <PaletteSection
          title="Light palette"
          palettes={lightPalettes}
          selectedId={lightPaletteId}
          onPreview={handlePreview}
          onPreviewEnd={handlePreviewEnd}
          onSelect={handleSelectLight}
        />
        <PaletteSection
          title="Dark palette"
          palettes={darkPalettes}
          selectedId={darkPaletteId}
          onPreview={handlePreview}
          onPreviewEnd={handlePreviewEnd}
          onSelect={handleSelectDark}
        />
      </div>
    </div>
  );
}

interface PaletteSectionProps {
  title: string;
  palettes: Palette[];
  selectedId: string;
  onPreview: (palette: Palette) => void;
  onPreviewEnd: () => void;
  onSelect: (id: string) => void;
}

function PaletteSection({
  title,
  palettes,
  selectedId,
  onPreview,
  onPreviewEnd,
  onSelect,
}: PaletteSectionProps): ReactNode {
  return (
    <div className="px-4 py-3 border-t border-[var(--sidebar-border)]">
      <div
        className="text-[11px] uppercase tracking-wide mb-2"
        style={{ color: "var(--tab-text)" }}
      >
        {title}
      </div>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
        onMouseLeave={onPreviewEnd}
      >
        {palettes.map((palette) => (
          <PaletteCard
            key={palette.id}
            palette={palette}
            selected={palette.id === selectedId}
            onPreview={onPreview}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

interface PaletteCardProps {
  palette: Palette;
  selected: boolean;
  onPreview: (palette: Palette) => void;
  onSelect: (id: string) => void;
}

function PaletteCard({
  palette,
  selected,
  onPreview,
  onSelect,
}: PaletteCardProps): ReactNode {
  const { swatches } = palette;
  return (
    <button
      type="button"
      onMouseEnter={() => onPreview(palette)}
      onFocus={() => onPreview(palette)}
      onClick={() => onSelect(palette.id)}
      className={classNames(
        "text-left p-2 rounded-md cursor-pointer transition-colors",
        "border bg-[var(--bg)]",
        selected
          ? "border-[var(--status-glow)]"
          : "border-[var(--sidebar-border)] hover:border-[var(--tab-text)]",
      )}
    >
      <div
        className="text-[12px] font-semibold mb-0.5"
        style={{ color: "var(--tab-active-text)" }}
      >
        {palette.name}
      </div>
      <div
        className="text-[10px] leading-snug mb-1.5"
        style={{ color: "var(--tab-text)" }}
      >
        {palette.description}
      </div>
      <div className="flex h-3 rounded overflow-hidden">
        <div className="flex-1" style={{ background: swatches.bg }} />
        <div className="flex-1" style={{ background: swatches.sidebarBg }} />
        <div className="flex-1" style={{ background: swatches.codeBg }} />
        <div className="flex-1" style={{ background: swatches.text }} />
        <div className="flex-1" style={{ background: swatches.accent }} />
        <div className="flex-1" style={{ background: swatches.synKeyword }} />
      </div>
    </button>
  );
}
