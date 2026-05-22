import solarizedLightHljs from "highlight.js/styles/base16/solarized-light.css?raw";
import gruvboxLightHljs from "highlight.js/styles/base16/gruvbox-light-hard.css?raw";
import papercolorLightHljs from "highlight.js/styles/base16/papercolor-light.css?raw";
import sagelightHljs from "highlight.js/styles/base16/sagelight.css?raw";
import rosePineDawnHljs from "highlight.js/styles/rose-pine-dawn.css?raw";
import tokyoLightHljs from "highlight.js/styles/tokyo-night-light.css?raw";
import atomOneLightHljs from "highlight.js/styles/atom-one-light.css?raw";
import arduinoLightHljs from "highlight.js/styles/arduino-light.css?raw";
import githubLightHljs from "highlight.js/styles/github.css?raw";
import githubDarkHljs from "highlight.js/styles/github-dark.css?raw";

export interface PaletteSwatches {
  bg: string;
  sidebarBg: string;
  text: string;
  accent: string;
  codeBg: string;
  synKeyword: string;
}

export interface Palette {
  id: string;
  name: string;
  description: string;
  mode: "light" | "dark";
  swatches: PaletteSwatches;
  hljsStylesheet: string;
}

export const palettes: Palette[] = [
  {
    id: "github-light",
    name: "GitHub Light",
    description: "The familiar default. Clean and neutral.",
    mode: "light",
    swatches: {
      bg: "#ffffff",
      sidebarBg: "#f6f8fa",
      text: "#24292f",
      accent: "#0969da",
      codeBg: "#f6f8fa",
      synKeyword: "#cf222e",
    },
    hljsStylesheet: githubLightHljs,
  },
  {
    id: "solarized-light",
    name: "Solarized Light",
    description: "Ethan Schoonover's classic warm cream. Distinctive.",
    mode: "light",
    swatches: {
      bg: "#fdf6e3",
      sidebarBg: "#eee8d5",
      text: "#586e75",
      accent: "#268bd2",
      codeBg: "#eee8d5",
      synKeyword: "#859900",
    },
    hljsStylesheet: solarizedLightHljs,
  },
  {
    id: "gruvbox-light",
    name: "Gruvbox Light",
    description: "Pastel warm cream with retro groove. High character.",
    mode: "light",
    swatches: {
      bg: "#fbf1c7",
      sidebarBg: "#f2e5bc",
      text: "#3c3836",
      accent: "#076678",
      codeBg: "#f2e5bc",
      synKeyword: "#9d0006",
    },
    hljsStylesheet: gruvboxLightHljs,
  },
  {
    id: "rose-pine-dawn",
    name: "Rose Pine Dawn",
    description: "Soft warm white with muted floral accents. Calm.",
    mode: "light",
    swatches: {
      bg: "#faf4ed",
      sidebarBg: "#fffaf3",
      text: "#575279",
      accent: "#56949f",
      codeBg: "#f2e9e1",
      synKeyword: "#907aa9",
    },
    hljsStylesheet: rosePineDawnHljs,
  },
  {
    id: "tokyo-day",
    name: "Tokyo Day",
    description: "Cool slate blues on near-white. Distinct from GitHub.",
    mode: "light",
    swatches: {
      bg: "#e1e2e7",
      sidebarBg: "#d5d6db",
      text: "#3760bf",
      accent: "#2e7de9",
      codeBg: "#d0d5e3",
      synKeyword: "#7847bd",
    },
    hljsStylesheet: tokyoLightHljs,
  },
  {
    id: "ayu-light",
    name: "Ayu Light",
    description: "Peach-tinted near-white with warm orange accents.",
    mode: "light",
    swatches: {
      bg: "#fafafa",
      sidebarBg: "#f3f4f5",
      text: "#5c6166",
      accent: "#fa8d3e",
      codeBg: "#f3f4f5",
      synKeyword: "#fa8d3e",
    },
    hljsStylesheet: atomOneLightHljs,
  },
  {
    id: "quiet-light",
    name: "Quiet Light",
    description: "Pale lavender background. Very soft, low contrast.",
    mode: "light",
    swatches: {
      bg: "#f5f5f5",
      sidebarBg: "#ececec",
      text: "#333333",
      accent: "#7a3e9d",
      codeBg: "#ececec",
      synKeyword: "#7a3e9d",
    },
    hljsStylesheet: atomOneLightHljs,
  },
  {
    id: "paper",
    name: "Paper",
    description: "Manila paper. Bookish, warmer than Solarized.",
    mode: "light",
    swatches: {
      bg: "#f2eede",
      sidebarBg: "#e8e2cf",
      text: "#222222",
      accent: "#1a73a8",
      codeBg: "#e8e2cf",
      synKeyword: "#a8651a",
    },
    hljsStylesheet: papercolorLightHljs,
  },
  {
    id: "noctis-lux",
    name: "Noctis Lux",
    description: "Warm orange-tinted white. Saturated accents.",
    mode: "light",
    swatches: {
      bg: "#fef8ec",
      sidebarBg: "#f6efde",
      text: "#005661",
      accent: "#0099a8",
      codeBg: "#f6efde",
      synKeyword: "#df769b",
    },
    hljsStylesheet: arduinoLightHljs,
  },
  {
    id: "mint-sage",
    name: "Mint Sage",
    description: "Cool pale green. Cucumber-cool, fresh.",
    mode: "light",
    swatches: {
      bg: "#f1f5ef",
      sidebarBg: "#e4ebde",
      text: "#2c3a2e",
      accent: "#2f7d68",
      codeBg: "#e4ebde",
      synKeyword: "#7a3a8a",
    },
    hljsStylesheet: sagelightHljs,
  },
  {
    id: "github-dark",
    name: "GitHub Dark",
    description: "The familiar dark default.",
    mode: "dark",
    swatches: {
      bg: "#0d1117",
      sidebarBg: "#161b22",
      text: "#e6edf3",
      accent: "#58a6ff",
      codeBg: "#161b22",
      synKeyword: "#ff7b72",
    },
    hljsStylesheet: githubDarkHljs,
  },
];

const paletteIndex = new Map(palettes.map((p) => [p.id, p]));

export function paletteById(id: string): Palette | undefined {
  return paletteIndex.get(id);
}

export function defaultPaletteForMode(mode: "light" | "dark"): Palette {
  return mode === "dark" ? paletteIndex.get("github-dark")! : paletteIndex.get("github-light")!;
}

export interface MermaidThemeVariables {
  background: string;
  primaryColor: string;
  primaryBorderColor: string;
  primaryTextColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  lineColor: string;
  textColor: string;
}

export function paletteMermaidVars(palette: Palette): MermaidThemeVariables {
  const { swatches } = palette;
  return {
    background: swatches.bg,
    primaryColor: swatches.codeBg,
    primaryBorderColor: swatches.accent,
    primaryTextColor: swatches.text,
    secondaryColor: swatches.sidebarBg,
    tertiaryColor: swatches.bg,
    lineColor: swatches.text,
    textColor: swatches.text,
  };
}
