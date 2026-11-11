import mermaid from "mermaid";
import { useEffect, useState } from "react";
import { defaultPaletteForMode, paletteById, paletteMermaidVars, type Palette } from "./themes";

mermaid.initialize({ startOnLoad: false, theme: "default" });

function readBodyPalette(): Palette {
  const id = document.body.dataset.palette;
  const mode = (document.body.dataset.theme as "light" | "dark") || "light";
  return (id && paletteById(id)) || defaultPaletteForMode(mode);
}

/** The palette set on `<body>`, updated when the theme or palette changes. */
export function useActivePalette(): Palette {
  const [palette, setPalette] = useState<Palette>(() => readBodyPalette());
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setPalette(readBodyPalette());
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-theme", "data-palette"],
    });
    return () => observer.disconnect();
  }, []);
  return palette;
}

/**
 * Draws a diagram into each `.mermaid-block` placeholder, themed by `palette`. Blocks drawn before
 * are drawn again, so this can run after a theme change. Returns a function that stops drawing the
 * blocks not drawn yet.
 */
export function renderMermaidBlocks(blocks: HTMLElement[], palette: Palette): () => void {
  if (blocks.length === 0) {
    return () => {};
  }

  // Store source text on first pass, reset rendered/errored blocks for re-render
  for (const block of blocks) {
    if (!block.dataset.mermaidSource) {
      const source = block.querySelector("code")?.textContent?.trim();
      if (source) {
        block.dataset.mermaidSource = source;
      }
    }
    block.classList.remove("mermaid-block--rendered", "mermaid-block--error");
    block.querySelector(".mermaid-rendered")?.remove();
    block.querySelector(".mermaid-error")?.remove();
  }

  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    themeVariables: {
      darkMode: palette.mode === "dark",
      ...paletteMermaidVars(palette),
    },
  });

  let cancelled = false;

  (async () => {
    for (const block of blocks) {
      if (cancelled) {
        break;
      }
      const code = block.dataset.mermaidSource;
      if (!code) {
        continue;
      }
      const id = `mermaid-${crypto.randomUUID()}`;
      try {
        const { svg } = await mermaid.render(id, code);
        if (cancelled) {
          break;
        }
        const svgContainer = document.createElement("div");
        svgContainer.className = "mermaid-rendered";
        svgContainer.innerHTML = svg;
        block.appendChild(svgContainer);
        block.classList.add("mermaid-block--rendered");
      } catch (err) {
        if (cancelled) {
          break;
        }
        block.classList.add("mermaid-block--error");
        const errorEl = document.createElement("div");
        errorEl.className = "mermaid-error";
        errorEl.textContent = err instanceof Error ? err.message : "Failed to render diagram";
        block.appendChild(errorEl);
        // Clean up any element mermaid may have injected into the document
        document.getElementById(id)?.remove();
      }
    }
  })();

  return () => {
    cancelled = true;
  };
}
