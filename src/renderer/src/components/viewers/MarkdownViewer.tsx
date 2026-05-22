import mermaid from "mermaid";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { annotationInsertionLine } from "../../../../shared/annotations";
import { classNames } from "../../classNames";
import type { Annotation, ContentWidthConfig, ContentWidthMode, MarkdownTab, ViewerCapabilities } from "../../types";
import { AnnotationGutter, type GutterLine } from "../AnnotationGutter";
import { useCurrentHeading } from "../../useCurrentHeading";
import { SegmentedControl } from "../ui-elements/SegmentedControl";
import { defaultPaletteForMode, paletteById, paletteMermaidVars, type Palette } from "../../themes";

mermaid.initialize({ startOnLoad: false, theme: "default" });

function readBodyPalette(): Palette {
  const id = document.body.dataset.palette;
  const mode = (document.body.dataset.theme as "light" | "dark") || "light";
  return (id && paletteById(id)) || defaultPaletteForMode(mode);
}

function useActivePalette(): Palette {
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

const { mdview } = window;

export function markdownCapabilities(tab: MarkdownTab): ViewerCapabilities {
  return { draggablePath: tab.path };
}

const modeOptions: { value: ContentWidthMode; label: string }[] = [
  { value: "fixed", label: "Fixed" },
  { value: "capped", label: "Capped" },
  { value: "full", label: "Full" },
];

const validUnits = ["px", "pt", "rem", "em", "ch", "vw", "vh"];

function normalizeCssWidth(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") {
    return null;
  }

  if (trimmed.includes("%")) {
    return null;
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return `${trimmed}px`;
  }

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([\w]+)$/);
  if (match && validUnits.includes(match[2])) {
    return `${match[1]}${match[2]}`;
  }

  return null;
}

interface MarkdownTopBarContentProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  content: string;
  contentWidth: ContentWidthConfig;
  onChangeMode: (mode: ContentWidthMode) => void;
  onChangeWidthValue: (value: string) => void;
}

export function MarkdownTopBarContent({
  scrollRef,
  content,
  contentWidth,
  onChangeMode,
  onChangeWidthValue,
}: MarkdownTopBarContentProps): ReactNode {
  const currentHeading = useCurrentHeading(scrollRef, content);
  const widthValue =
    contentWidth.mode === "fixed"
      ? contentWidth.fixedWidth
      : contentWidth.cappedWidth;
  const showInput = contentWidth.mode !== "full";

  const [draft, setDraft] = useState(widthValue);

  useEffect(() => {
    setDraft(widthValue);
  }, [widthValue]);

  const commitValue = useCallback(() => {
    const normalized = normalizeCssWidth(draft);
    if (normalized) {
      setDraft(normalized);
      onChangeWidthValue(normalized);
    } else {
      setDraft(widthValue);
    }
  }, [draft, widthValue, onChangeWidthValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        commitValue();
        (e.target as HTMLInputElement).blur();
      }
      if (e.key === "Escape") {
        setDraft(widthValue);
        (e.target as HTMLInputElement).blur();
      }
    },
    [commitValue, widthValue],
  );

  return (
    <>
      <div className="text-[11px] text-[var(--tab-text)] truncate min-w-0">
        {currentHeading.map((text, i) => (
          <span key={i}>
            {i > 0 && (
              <span className="mx-1 opacity-40">&rsaquo;</span>
            )}
            {text}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {showInput && (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitValue}
            onKeyDown={handleKeyDown}
            className={classNames(
              "w-20 px-2 py-0.5 text-[11px] rounded-md",
              "bg-[var(--sidebar-bg)] text-[var(--tab-active-text)]",
              "border border-[var(--sidebar-border)]",
              "outline-none focus:border-[var(--tab-active-text)]",
            )}
          />
        )}
        <SegmentedControl
          options={modeOptions}
          value={contentWidth.mode}
          onChange={onChangeMode}
        />
      </div>
    </>
  );
}

export function resolveMarkdownLineNumber(node: Node): number | null {
  const el = node instanceof HTMLElement ? node : node.parentElement;
  const sourceLine = el?.closest("[data-source-line]");
  if (!sourceLine) { return null; }
  const line = parseInt((sourceLine as HTMLElement).dataset.sourceLine!, 10);
  return isNaN(line) ? null : line;
}

function measureMarkdownLines(contentEl: HTMLElement, gutterEl: HTMLElement): GutterLine[] {
  const gutterRect = gutterEl.getBoundingClientRect();
  const allElements = contentEl.querySelectorAll<HTMLElement>("[data-source-line]");
  const elements = Array.from(allElements).filter(e =>
    !e.closest(".annotation-block")
  );
  const byLine = new Map<number, { line: number; top: number; bottom: number; htmlBlock: boolean }>();

  for (const element of elements) {
    const line = parseInt(element.dataset.sourceLine!, 10);
    const rect = element.getBoundingClientRect();
    let bottom = rect.bottom;

    // If this element contains children with data-source-line, clip its height
    // to just its own content (before the first child). Otherwise the gutter
    // entry would span the entire nested content.
    const firstChild = element.querySelector("[data-source-line]");
    if (firstChild) {
      bottom = firstChild.getBoundingClientRect().top;
    }

    byLine.set(line, {
      line,
      top: rect.top - gutterRect.top,
      bottom: bottom - gutterRect.top,
      htmlBlock: element.classList.contains("html-block"),
    });
  }

  const raw = [...byLine.values()];

  return raw.map((entry, i) => {
    const nextLine = i < raw.length - 1 ? raw[i + 1].line : null;
    const endLine = nextLine != null ? nextLine - 1 : entry.line;
    return { ...entry, endLine: Math.max(endLine, entry.line) };
  });
}

interface MarkdownContentProps {
  tab: MarkdownTab;
  contentWidth: ContentWidthConfig;
  contentElRef: (el: HTMLDivElement | null) => void;
  findMatchLines?: Set<number>;
}

export function MarkdownContent({
  tab,
  contentWidth,
  contentElRef,
  findMatchLines,
}: MarkdownContentProps): ReactNode {
  const activePalette = useActivePalette();
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);

  const combinedRef = useCallback((el: HTMLDivElement | null) => {
    setContentEl(el);
    contentElRef(el);
  }, [contentElRef]);

  const [collapsedInsertionLines, setCollapsedInsertionLines] = useState<Set<number>>(new Set());

  const handleDotClick = useCallback((insertionLines: number[]) => {
    setCollapsedInsertionLines((prev) => {
      const next = new Set(prev);
      const allCollapsed = insertionLines.every((il) => next.has(il));
      for (const il of insertionLines) {
        if (allCollapsed) {
          next.delete(il);
        } else {
          next.add(il);
        }
      }
      return next;
    });
  }, []);

  const renderedHtml = useMemo(() => {
    return mdview.renderMarkdown(tab.content, 1);
  }, [tab.content]);

  // Manage innerHTML manually via ref so React never touches the element's children.
  // This prevents React 19's dangerouslySetInnerHTML reconciliation from destroying
  // our injected annotation wrappers on re-renders.
  const markdownBodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (markdownBodyRef.current) {
      markdownBodyRef.current.innerHTML = renderedHtml;
    }
  }, [renderedHtml]);

  // Render mermaid diagrams in placeholder blocks (re-runs on theme change)
  useEffect(() => {
    const markdownBody = markdownBodyRef.current;
    if (!markdownBody) {
      return;
    }
    const blocks = markdownBody.querySelectorAll<HTMLElement>(".mermaid-block");
    if (blocks.length === 0) {
      return;
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
        darkMode: activePalette.mode === "dark",
        ...paletteMermaidVars(activePalette),
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
  }, [renderedHtml, activePalette]);

  // Ref so the injection effect can read collapsed state without re-running on changes
  const collapsedRef = useRef(collapsedInsertionLines);
  collapsedRef.current = collapsedInsertionLines;

  // Inject annotation blocks into the DOM after the markdown content is set
  useEffect(() => {
    const markdownBody = markdownBodyRef.current;
    if (!markdownBody || !tab.annotations || tab.annotations.length === 0) {
      return;
    }

    // Group annotations by insertion line
    const byLine = new Map<number, Annotation[]>();
    for (const a of tab.annotations) {
      const line = annotationInsertionLine(a);
      const group = byLine.get(line);
      if (group) {
        group.push(a);
      } else {
        byLine.set(line, [a]);
      }
    }

    // Source-line elements in document order, excluding any inside annotation blocks
    const sourceLineElements = Array.from(
      markdownBody.querySelectorAll<HTMLElement>("[data-source-line]"),
    ).filter((e) => !e.closest(".annotation-block"));

    const injected: HTMLElement[] = [];
    const sortedInsertionLines = [...byLine.keys()].sort((a, b) => a - b);
    const collapsed = collapsedRef.current;

    for (const insertionLine of sortedInsertionLines) {
      const annotations = byLine.get(insertionLine)!;

      // Find the last source-line element at or before the insertion line
      let target: HTMLElement | null = null;
      for (const el of sourceLineElements) {
        const line = parseInt(el.dataset.sourceLine!, 10);
        if (line <= insertionLine) {
          target = el;
        }
      }

      if (!target) {
        continue;
      }

      // Find the DOM node to insert after
      let insertAfter: Element;
      const pre = target.closest("pre");
      if (pre && markdownBody.contains(pre)) {
        // Inside a code block — insert after the <pre>
        insertAfter = pre;
      } else {
        // Walk up to the direct child of .markdown-body
        let ancestor: Element = target;
        while (ancestor.parentElement && ancestor.parentElement !== markdownBody) {
          ancestor = ancestor.parentElement;
        }
        insertAfter = ancestor;
      }

      // Skip past any annotation wrappers already inserted after this element
      while (insertAfter.nextElementSibling?.classList.contains("annotation-wrapper")) {
        insertAfter = insertAfter.nextElementSibling;
      }

      for (const a of annotations) {
        const wrapper = document.createElement("div");
        wrapper.className = "annotation-wrapper" +
          (collapsed.has(insertionLine) ? " annotation-wrapper--collapsed" : "");
        wrapper.dataset.insertionLine = String(insertionLine);

        const block = document.createElement("div");
        block.className = "annotation-block";

        const dismiss = document.createElement("button");
        dismiss.className = "annotation-dismiss";
        dismiss.dataset.annotationId = a.id;
        dismiss.setAttribute("aria-label", "Dismiss annotation");
        dismiss.textContent = "\u00d7";

        const body = document.createElement("div");
        body.className = "markdown-body";
        body.innerHTML = mdview.renderMarkdown(a.content);

        block.appendChild(dismiss);
        block.appendChild(body);
        wrapper.appendChild(block);

        insertAfter.after(wrapper);
        insertAfter = wrapper;
        injected.push(wrapper);
      }
    }

    return () => {
      for (const el of injected) {
        el.remove();
      }
    };
  }, [tab.content, tab.annotations]);

  // Toggle collapsed class on existing annotation wrappers (separate effect so CSS transitions work)
  useLayoutEffect(() => {
    const markdownBody = markdownBodyRef.current;
    if (!markdownBody) {
      return;
    }
    const wrappers = markdownBody.querySelectorAll<HTMLElement>(".annotation-wrapper");
    for (const wrapper of wrappers) {
      const line = parseInt(wrapper.dataset.insertionLine!, 10);
      if (collapsedInsertionLines.has(line)) {
        wrapper.classList.add("annotation-wrapper--collapsed");
      } else {
        wrapper.classList.remove("annotation-wrapper--collapsed");
      }
    }
  }, [collapsedInsertionLines, tab.annotations]);

  // Event delegation for dismiss buttons on injected annotation nodes
  useEffect(() => {
    if (!contentEl) {
      return;
    }
    const handler = (e: MouseEvent) => {
      const dismiss = (e.target as HTMLElement).closest(".annotation-dismiss");
      if (dismiss instanceof HTMLElement) {
        const id = dismiss.dataset.annotationId;
        if (id) {
          mdview.dismissAnnotation(tab.path, id);
        }
      }
    };
    contentEl.addEventListener("click", handler);
    return () => contentEl.removeEventListener("click", handler);
  }, [contentEl, tab.path]);

  const contentStyle: React.CSSProperties = (() => {
    switch (contentWidth.mode) {
      case "fixed":
        return {
          width: contentWidth.fixedWidth,
          minWidth: contentWidth.fixedWidth,
        };
      case "capped":
        return { maxWidth: contentWidth.cappedWidth };
      case "full":
        return {};
    }
  })();

  return (
    <>
      <div className="flex min-h-full">
        <AnnotationGutter
          contentEl={contentEl}
          measureLines={measureMarkdownLines}
          contentKey={tab.content}
          annotations={tab.annotations}
          collapsedInsertionLines={collapsedInsertionLines}
          onDotClick={handleDotClick}
          findMatchLines={findMatchLines}
        />
        <div ref={combinedRef} className="flex-1 min-w-0 pl-8">
          <div className="mx-auto" style={contentStyle}>
            <div className="markdown-body" ref={markdownBodyRef} />
          </div>
        </div>
      </div>
    </>
  );
}
