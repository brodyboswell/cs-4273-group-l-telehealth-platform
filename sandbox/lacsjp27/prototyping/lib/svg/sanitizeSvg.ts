const MAX_SVG_LENGTH = 20_000;

const ALLOWED_TAGS = new Set([
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
]);

const ALLOWED_ATTRIBUTES = new Set([
  "d",
  "points",
  "x",
  "y",
  "x1",
  "x2",
  "y1",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "width",
  "height",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "fill-opacity",
  "stroke-opacity",
  "opacity",
  "transform",
]);

const ALLOWED_COLORS = new Set([
  "#293c35",
  "#cf5547",
  "#df8b37",
  "#53886b",
  "#477fb2",
  "#8a63aa",
  "none",
  "transparent",
]);

const NUMERIC_ATTRIBUTES = new Set([
  "x",
  "y",
  "x1",
  "x2",
  "y1",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "width",
  "height",
  "stroke-width",
  "fill-opacity",
  "stroke-opacity",
  "opacity",
]);

/** Keeps generated SVG to a small, self-contained set of static shapes. */
export function sanitizeGeneratedSvg(value: string): string {
  const source = value
    .replace(/^\s*```(?:svg|xml)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  if (source.length > MAX_SVG_LENGTH)
    throw new Error("The generated SVG is too large. Try a simpler drawing.");

  const rootMatch = /<svg\b[^>]*>([\s\S]*?)<\/svg\s*>/i.exec(source);
  if (!rootMatch)
    throw new Error("The model did not return a complete SVG drawing.");

  const rawBody = rootMatch[1];
  if (/<!--/.test(rawBody.replace(/<!--[\s\S]*?-->/g, "")))
    throw new Error("The generated SVG contains an incomplete comment.");
  const body = rawBody.replace(/<!--[\s\S]*?-->/g, "");
  const tagPattern = /<\s*(\/?)\s*([a-z][a-z0-9:-]*)\b([^>]*)>/gi;
  const sanitizedParts: string[] = [];
  const openTags: string[] = [];
  let position = 0;
  let shapeCount = 0;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(body)) !== null) {
    const closing = match[1] === "/";
    const tagName = match[2].toLowerCase();
    if (!ALLOWED_TAGS.has(tagName))
      throw new Error(`The generated SVG uses an unsupported element: ${tagName}.`);

    if (closing) {
      if (match[3].trim() || openTags.pop() !== tagName)
        throw new Error("The generated SVG has mismatched shape tags.");
      sanitizedParts.push(`</${tagName}>`);
      position = tagPattern.lastIndex;
      continue;
    }

    const isSelfClosing = /\/\s*$/.test(match[3]);
    const attributeText = isSelfClosing
      ? match[3].replace(/\/\s*$/, "")
      : match[3];
    const attributes = sanitizeAttributes(attributeText);
    sanitizedParts.push(
      `<${tagName}${attributes ? ` ${attributes}` : ""}${isSelfClosing ? "/>" : ">"}`,
    );
    if (!isSelfClosing) openTags.push(tagName);
    if (tagName !== "g") shapeCount += 1;
    position = tagPattern.lastIndex;
  }

  if (openTags.length > 0 || shapeCount === 0)
    throw new Error("The generated SVG is incomplete or contains unsupported content.");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="350" viewBox="0 0 500 350">${sanitizedParts.join("")}</svg>`;
}

function sanitizeAttributes(source: string): string {
  const attributePattern = /([a-zA-Z][a-zA-Z0-9:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  const safeAttributes: string[] = [];
  let position = 0;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(source)) !== null) {
    if (source.slice(position, match.index).trim())
      throw new Error("The generated SVG contains malformed attributes.");

    const name = match[1].toLowerCase();
    const value = match[3] ?? match[4] ?? "";
    if (ALLOWED_ATTRIBUTES.has(name) && isSafeAttributeValue(name, value))
      safeAttributes.push(`${name}="${escapeAttribute(value)}"`);

    position = attributePattern.lastIndex;
  }

  if (source.slice(position).trim())
    throw new Error("The generated SVG contains malformed attributes.");

  return safeAttributes.join(" ");
}

function isSafeAttributeValue(name: string, value: string): boolean {
  if (value.length > 8_000 || /[<>`]/.test(value)) return false;

  if (name === "d")
    return /^[MmLlHhVvCcSsQqTtAaZz0-9eE+\-.,\s]+$/.test(value);
  if (name === "points") return /^[0-9eE+\-.,\s]+$/.test(value);
  if (name === "fill" || name === "stroke") {
    return (
      ALLOWED_COLORS.has(value.toLowerCase()) ||
      /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(value)
    );
  }
  if (name === "stroke-linecap")
    return ["butt", "round", "square"].includes(value);
  if (name === "stroke-linejoin")
    return ["miter", "round", "bevel"].includes(value);
  if (name === "transform")
    return /^(?:(?:translate|scale|rotate)\([\d\s.,+\-eE]+\)\s*)+$/.test(value);
  if (NUMERIC_ATTRIBUTES.has(name)) {
    if (!/^-?\d+(?:\.\d+)?$/.test(value)) return false;
    const number = Number(value);
    return Number.isFinite(number) && Math.abs(number) <= 2_000;
  }

  return false;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
