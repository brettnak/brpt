import { useEffect } from "react";

import darkMdCss from "github-markdown-css/github-markdown-dark.css?raw";
import lightMdCss from "github-markdown-css/github-markdown-light.css?raw";

import type { Palette } from "./themes";

/** Keeps markdown styles from matching anything inside a raw HTML block. Matches the scope on the palette overrides in App.css. */
function scopeOutsideHtmlBlocks(css: string): string {
  return `@scope (html) to (.html-block-content) {\n${css}\n}`;
}

function createStyle(id: string, css: string): HTMLStyleElement {
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }
  return style;
}

export function useThemeStyles(palette: Palette): void {
  useEffect(() => {
    const lightMd = createStyle("markdown-theme-light", scopeOutsideHtmlBlocks(lightMdCss));
    const darkMd = createStyle("markdown-theme-dark", scopeOutsideHtmlBlocks(darkMdCss));
    const hljs = createStyle("hljs-active", palette.hljsStylesheet);

    hljs.textContent = palette.hljsStylesheet;

    if (palette.mode === "dark") {
      lightMd.disabled = true;
      darkMd.disabled = false;
    } else {
      lightMd.disabled = false;
      darkMd.disabled = true;
    }
  }, [palette]);
}
