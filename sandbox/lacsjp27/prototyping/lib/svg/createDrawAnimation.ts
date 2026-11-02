const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const SHAPE_SELECTOR = "path, rect, circle, ellipse, line, polyline, polygon";
const STROKE_DURATION_MS = 900;
const FILL_DURATION_MS = 300;
const BETWEEN_SHAPES_PAUSE_MS = 120;

export type SvgDrawAnimation = {
  markup: string;
  durationMs: number;
};

/** Adds browser-native stroke and fill animations to an already-sanitized SVG. */
export function createDrawAnimation(svgMarkup: string): SvgDrawAnimation {
  const document = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const root = document.documentElement;
  if (root.localName !== "svg" || document.querySelector("parsererror"))
    throw new Error("The generated drawing could not be animated.");

  root.setAttribute("width", "100%");
  root.setAttribute("height", "100%");

  const shapes = Array.from(root.querySelectorAll(SHAPE_SELECTOR));
  if (shapes.length === 0)
    throw new Error("The generated drawing does not contain any shapes to animate.");

  let nextStartMs = 0;
  shapes.forEach((shape, index) => {
    const startMs = nextStartMs;
    const stroke = inheritedAttribute(shape, "stroke", "none");
    const hasStroke = stroke.toLowerCase() !== "none";

    if (hasStroke) {
      shape.setAttribute("pathLength", "1");
      shape.setAttribute("stroke-dasharray", "1");
      shape.setAttribute("stroke-dashoffset", "1");
      appendAnimation(document, shape, {
        attributeName: "stroke-dashoffset",
        from: "1",
        to: "0",
        begin: `${startMs}ms`,
        duration: `${STROKE_DURATION_MS}ms`,
      });
    }

    const fill = inheritedAttribute(shape, "fill", "black");
    const fillOpacity = Number(inheritedAttribute(shape, "fill-opacity", "1"));
    const hasFill = fill.toLowerCase() !== "none" && fillOpacity > 0;
    if (hasFill) {
      shape.setAttribute("fill-opacity", "0");
      appendAnimation(document, shape, {
        attributeName: "fill-opacity",
        from: "0",
        to: String(fillOpacity),
        begin: `${startMs + (hasStroke ? STROKE_DURATION_MS : 0)}ms`,
        duration: `${FILL_DURATION_MS}ms`,
      });
    }

    const shapeDurationMs =
      (hasStroke ? STROKE_DURATION_MS : 0) + (hasFill ? FILL_DURATION_MS : 0);
    nextStartMs =
      startMs + shapeDurationMs + (index < shapes.length - 1 ? BETWEEN_SHAPES_PAUSE_MS : 0);
  });

  const durationMs = nextStartMs + 80;

  return {
    markup: new XMLSerializer().serializeToString(root),
    durationMs,
  };
}

function inheritedAttribute(element: Element, name: string, fallback: string): string {
  let current: Element | null = element;
  while (current && current.namespaceURI === SVG_NAMESPACE) {
    if (current.hasAttribute(name)) return current.getAttribute(name) ?? fallback;
    current = current.parentElement;
  }
  return fallback;
}

function appendAnimation(
  document: Document,
  shape: Element,
  timing: {
    attributeName: string;
    from: string;
    to: string;
    begin: string;
    duration: string;
  },
) {
  const animation = document.createElementNS(SVG_NAMESPACE, "animate");
  animation.setAttribute("attributeName", timing.attributeName);
  animation.setAttribute("from", timing.from);
  animation.setAttribute("to", timing.to);
  animation.setAttribute("begin", timing.begin);
  animation.setAttribute("dur", timing.duration);
  animation.setAttribute("fill", "freeze");
  shape.appendChild(animation);
}
