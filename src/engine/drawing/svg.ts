import type { Drawing, Layer, Primitive, Style } from "./types";

/**
 * Serialises a drawing to SVG.
 *
 * The drawing's y axis points up, the way a drawing is dimensioned; SVG's points
 * down. Rather than negate every coordinate at every call site, the whole thing is
 * wrapped in one `scale(1,-1)` transform, and text is flipped back locally so it
 * still reads left to right.
 */

export type SvgTheme = {
  readonly background: string;
  readonly colors: Partial<Record<Layer, string>>;
  readonly textColor: string;
  readonly fontFamily: string;
  readonly monoFamily: string;
};

export const DARK_THEME: SvgTheme = {
  background: "transparent",
  colors: {
    outline: "#e8e6e1",
    cut: "#f0a35e",
    hole: "#6cb6ff",
    "hole-far": "#4a6b8a",
    groove: "#c78bff",
    rabbet: "#c78bff",
    grain: "#9aa4b2",
    dimension: "#8b96a5",
    annotation: "#c3cad4",
    datum: "#ffb454",
    hidden: "#5a6472",
    fold: "#5ad1a5",
  },
  textColor: "#c3cad4",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  monoFamily: "ui-monospace, monospace",
};

export const PRINT_THEME: SvgTheme = {
  background: "#ffffff",
  colors: {
    outline: "#000000",
    cut: "#000000",
    hole: "#000000",
    "hole-far": "#9a9a9a",
    groove: "#444444",
    rabbet: "#444444",
    grain: "#777777",
    dimension: "#333333",
    annotation: "#000000",
    datum: "#000000",
    hidden: "#aaaaaa",
    fold: "#000000",
  },
  textColor: "#000000",
  fontFamily: "Helvetica, Arial, sans-serif",
  monoFamily: "Courier, monospace",
};

export type SvgOptions = {
  readonly theme?: SvgTheme;
  /** Pixels per millimetre. Omit to let the SVG scale to its container. */
  readonly pixelsPerMm?: number;
  /** Emit width and height attributes as well as the viewBox. */
  readonly sized?: boolean;
};

export function drawingToSvg(drawing: Drawing, options: SvgOptions = {}): string {
  const theme = options.theme ?? DARK_THEME;
  const scale = options.pixelsPerMm ?? 1;

  const body = drawing.primitives.map((p) => primitiveToSvg(p, theme)).join("\n    ");
  const viewBox = `${round(drawing.x)} ${round(-(drawing.y + drawing.height))} ${round(drawing.width)} ${round(drawing.height)}`;
  const size = options.sized
    ? ` width="${round(drawing.width * scale)}" height="${round(drawing.height * scale)}"`
    : ' width="100%" height="100%"';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${size} preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeAttr(drawing.title)}">
  <defs>
    <pattern id="ws-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="4" stroke="${theme.colors.groove ?? "#888"}" stroke-width="0.5" opacity="0.6" />
    </pattern>
  </defs>
  ${theme.background === "transparent" ? "" : `<rect x="${round(drawing.x)}" y="${round(-(drawing.y + drawing.height))}" width="${round(drawing.width)}" height="${round(drawing.height)}" fill="${theme.background}" />`}
  <g transform="scale(1,-1)">
    ${body}
  </g>
</svg>`;
}

function colorFor(style: Style, theme: SvgTheme): string {
  return style.stroke ?? theme.colors[style.layer] ?? theme.textColor;
}

function commonAttrs(style: Style, theme: SvgTheme): string {
  const parts = [
    `stroke="${colorFor(style, theme)}"`,
    `stroke-width="${style.strokeWidth ?? 0.3}"`,
    'vector-effect="non-scaling-stroke"',
  ];
  if (style.dash) parts.push(`stroke-dasharray="${style.dash.join(" ")}"`);
  if (style.opacity !== undefined) parts.push(`opacity="${style.opacity}"`);
  parts.push(`fill="${fillFor(style)}"`);
  return parts.join(" ");
}

function fillFor(style: Style): string {
  if (style.hatch) return "url(#ws-hatch)";
  return style.fill ?? "none";
}

function primitiveToSvg(primitive: Primitive, theme: SvgTheme): string {
  switch (primitive.kind) {
    case "rect":
      return `<rect x="${round(primitive.x)}" y="${round(primitive.y)}" width="${round(primitive.width)}" height="${round(primitive.height)}"${primitive.radius ? ` rx="${round(primitive.radius)}"` : ""} ${commonAttrs(primitive.style, theme)} />`;
    case "line":
      return `<line x1="${round(primitive.x1)}" y1="${round(primitive.y1)}" x2="${round(primitive.x2)}" y2="${round(primitive.y2)}" ${commonAttrs(primitive.style, theme)} />`;
    case "circle":
      return `<circle cx="${round(primitive.cx)}" cy="${round(primitive.cy)}" r="${round(primitive.r)}" ${commonAttrs(primitive.style, theme)} />`;
    case "polyline": {
      const points = primitive.points.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
      return primitive.closed
        ? `<polygon points="${points}" ${commonAttrs(primitive.style, theme)} />`
        : `<polyline points="${points}" ${commonAttrs(primitive.style, theme)} />`;
    }
    case "text": {
      // Undo the global y flip so the glyphs are the right way up, then apply any
      // rotation the caller asked for.
      const transform = `translate(${round(primitive.x)},${round(primitive.y)}) scale(1,-1)${primitive.rotate ? ` rotate(${-primitive.rotate})` : ""}`;
      const baseline =
        primitive.baseline === "top"
          ? "hanging"
          : primitive.baseline === "middle"
            ? "central"
            : "auto";
      const color = primitive.style.stroke ?? theme.colors[primitive.style.layer] ?? theme.textColor;
      return `<text transform="${transform}" font-size="${round(primitive.size)}" font-family="${primitive.mono ? theme.monoFamily : theme.fontFamily}" text-anchor="${primitive.anchor}" dominant-baseline="${baseline}" fill="${color}" stroke="none"${primitive.style.opacity !== undefined ? ` opacity="${primitive.style.opacity}"` : ""}>${escapeText(primitive.text)}</text>`;
    }
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return escapeText(text).replace(/"/g, "&quot;");
}
