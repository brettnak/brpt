import { useEffect } from "react";

import darkMdCss from "github-markdown-css/github-markdown-dark.css?raw";
import lightMdCss from "github-markdown-css/github-markdown-light.css?raw";

import type { Palette } from "./themes";

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
    const lightMd = createStyle("markdown-theme-light", lightMdCss);
    const darkMd = createStyle("markdown-theme-dark", darkMdCss);
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
