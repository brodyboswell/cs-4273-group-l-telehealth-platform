import { WHITEBOARD_DOODLE_COLORS } from './palette';

/** Maximum SVG payload accepted from the virtual client. */
export const MAX_WHITEBOARD_SVG_LENGTH = 12_000;

/** Maximum client-facing description attached to an SVG action. */
export const MAX_WHITEBOARD_SPOKEN_TEXT_LENGTH = 180;

const MAX_SHAPES = 64;
const MAX_ELEMENTS = 128;
const MAX_GROUP_DEPTH = 16;
const MAX_ATTRIBUTE_VALUE_LENGTH = 8_000;

const ALLOWED_TAGS = new Set([
	'g',
	'path',
	'rect',
	'circle',
	'ellipse',
	'line',
	'polyline',
	'polygon',
]);

const ALLOWED_ATTRIBUTES = new Set([
	'd',
	'points',
	'x',
	'y',
	'x1',
	'x2',
	'y1',
	'y2',
	'cx',
	'cy',
	'r',
	'rx',
	'ry',
	'width',
	'height',
	'fill',
	'stroke',
	'stroke-width',
	'stroke-linecap',
	'stroke-linejoin',
	'fill-opacity',
	'stroke-opacity',
	'opacity',
	'transform',
]);

const ALLOWED_COLORS = new Set([
	...WHITEBOARD_DOODLE_COLORS.map(({ value }) => value.toLowerCase()),
	'none',
	'transparent',
]);

const NUMERIC_ATTRIBUTES = new Set([
	'x',
	'y',
	'x1',
	'x2',
	'y1',
	'y2',
	'cx',
	'cy',
	'r',
	'rx',
	'ry',
	'width',
	'height',
	'stroke-width',
	'fill-opacity',
	'stroke-opacity',
	'opacity',
]);

const NON_NEGATIVE_ATTRIBUTES = new Set([
	'r',
	'rx',
	'ry',
	'width',
	'height',
	'stroke-width',
]);

/**
 * Accepts a small static SVG subset and returns a canonical document. All
 * model-provided root attributes are discarded before the result is returned.
 */
export function sanitizeWhiteboardSvg(value: unknown): string {
	if (typeof value !== 'string' || value.length > MAX_WHITEBOARD_SVG_LENGTH) {
		throw new Error('The generated SVG is missing or too large.');
	}

	const source = stripMarkdownFence(value.trim());
	const body = extractSvgBody(source);
	const sanitizedParts: string[] = [];
	const openTags: string[] = [];
	let position = 0;
	let shapeCount = 0;
	let elementCount = 0;

	while (position < body.length) {
		while (position < body.length && /\s/.test(body[position]!)) position += 1;
		if (position === body.length) break;

		if (body[position] !== '<') {
			throw new Error('SVG text content is not allowed.');
		}

		const tagEnd = findTagEnd(body, position);
		if (tagEnd === -1) {
			throw new Error('The SVG contains an incomplete element.');
		}

		const token = body.slice(position, tagEnd + 1);
		const parsedTag = parseTag(token);
		const tagName = parsedTag.name.toLowerCase();

		if (!ALLOWED_TAGS.has(tagName)) {
			throw new Error(`Unsupported SVG element: ${tagName}.`);
		}

		if (parsedTag.isClosing) {
			if (parsedTag.isSelfClosing || openTags.pop() !== tagName) {
				throw new Error('The SVG contains mismatched shape tags.');
			}

			sanitizedParts.push(`</${tagName}>`);
			position = tagEnd + 1;
			continue;
		}

		// Shapes are leaves; groups are the only elements allowed to contain tags.
		if (openTags.some((openTag) => openTag !== 'g')) {
			throw new Error('SVG shapes cannot contain nested elements.');
		}

		const attributes = sanitizeAttributes(parsedTag.attributes);
		sanitizedParts.push(
			`<${tagName}${attributes ? ` ${attributes}` : ''}${parsedTag.isSelfClosing ? '/>' : '>'}`,
		);

		elementCount += 1;
		if (elementCount > MAX_ELEMENTS) {
			throw new Error('The SVG contains too many elements.');
		}

		if (tagName !== 'g') {
			shapeCount += 1;
			if (shapeCount > MAX_SHAPES) {
				throw new Error('The SVG contains too many shapes.');
			}
		}

		if (!parsedTag.isSelfClosing) {
			if (
				tagName === 'g' &&
				openTags.filter((openTag) => openTag === 'g').length >= MAX_GROUP_DEPTH
			) {
				throw new Error('The SVG groups are nested too deeply.');
			}
			openTags.push(tagName);
		}

		position = tagEnd + 1;
	}

	if (openTags.length > 0 || shapeCount === 0) {
		throw new Error('The SVG is incomplete or contains unsupported content.');
	}

	return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="350" viewBox="0 0 500 350">${sanitizedParts.join('')}</svg>`;
}

function stripMarkdownFence(value: string): string {
	const openingFence = /^```(?:svg|xml)?[ \t]*(?:\r?\n)?/i;
	if (!openingFence.test(value)) return value;

	const closingFence = /(?:\r?\n)?[ \t]*```\s*$/;
	if (!closingFence.test(value)) {
		throw new Error('The SVG code fence is incomplete.');
	}

	return value.replace(openingFence, '').replace(closingFence, '').trim();
}

function extractSvgBody(source: string): string {
	if (!/^<svg(?=\s|>)/i.test(source)) {
		throw new Error('The model did not return one complete SVG drawing.');
	}

	const openingEnd = findTagEnd(source, 0);
	if (openingEnd === -1) {
		throw new Error('The model did not return one complete SVG drawing.');
	}

	const openingTag = source.slice(0, openingEnd + 1);
	if (/\/\s*>$/.test(openingTag)) {
		throw new Error('The model did not return one complete SVG drawing.');
	}

	const closing = /<\/svg\s*>$/i.exec(source);
	if (!closing || closing.index < openingEnd + 1) {
		throw new Error('The model did not return one complete SVG drawing.');
	}

	const rootAttributes = openingTag.slice(4, -1);
	validateDiscardedRootAttributes(rootAttributes);
	return source.slice(openingEnd + 1, closing.index);
}

/** Root attributes are parsed for well-formedness, then omitted from output. */
function validateDiscardedRootAttributes(source: string): void {
	let position = 0;
	const seenNames = new Set<string>();

	while (position < source.length) {
		while (position < source.length && /\s/.test(source[position]!)) position += 1;
		if (position === source.length) return;

		const nameMatch = /^[a-z_:][a-z0-9_.:-]*/i.exec(source.slice(position));
		if (!nameMatch) throw new Error('The SVG root attributes are malformed.');

		const name = nameMatch[0].toLowerCase();
		if (seenNames.has(name)) {
			throw new Error('The SVG root contains duplicate attributes.');
		}
		seenNames.add(name);
		position += nameMatch[0].length;

		while (position < source.length && /\s/.test(source[position]!)) position += 1;
		if (source[position] !== '=') {
			throw new Error('The SVG root attributes are malformed.');
		}
		position += 1;
		while (position < source.length && /\s/.test(source[position]!)) position += 1;

		const quote = source[position];
		if (quote !== '"' && quote !== "'") {
			throw new Error('The SVG root attributes are malformed.');
		}
		position += 1;
		while (position < source.length && source[position] !== quote) {
			if (source[position] === '<' || isXmlControl(source[position]!)) {
				throw new Error('The SVG root attributes are malformed.');
			}
			position += 1;
		}
		if (position >= source.length) {
			throw new Error('The SVG root attributes are malformed.');
		}

		position += 1;
		if (position < source.length && !/\s/.test(source[position]!)) {
			throw new Error('The SVG root attributes are malformed.');
		}
	}
}

function findTagEnd(source: string, start: number): number {
	let quote: string | null = null;

	for (let position = start; position < source.length; position += 1) {
		const character = source[position]!;
		if (quote) {
			if (character === quote) quote = null;
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
		} else if (character === '>') {
			return position;
		}
	}

	return -1;
}

function parseTag(token: string): {
	name: string;
	attributes: string;
	isClosing: boolean;
	isSelfClosing: boolean;
} {
	const contents = token.slice(1, -1);
	if (contents.startsWith('/')) {
		const closingMatch = /^\/([a-z][a-z0-9:-]*)\s*$/i.exec(contents);
		if (!closingMatch) throw new Error('The SVG contains a malformed closing tag.');
		return {
			name: closingMatch[1]!,
			attributes: '',
			isClosing: true,
			isSelfClosing: false,
		};
	}

	const openingMatch = /^([a-z][a-z0-9:-]*)([\s\S]*)$/i.exec(contents);
	if (!openingMatch) throw new Error('The SVG contains a malformed element.');

	let attributes = openingMatch[2]!;
	const isSelfClosing = /\/\s*$/.test(attributes);
	if (isSelfClosing) attributes = attributes.replace(/\/\s*$/, '');

	return {
		name: openingMatch[1]!,
		attributes,
		isClosing: false,
		isSelfClosing,
	};
}

function sanitizeAttributes(source: string): string {
	const safeAttributes: string[] = [];
	const seenNames = new Set<string>();
	let position = 0;

	while (position < source.length) {
		while (position < source.length && /\s/.test(source[position]!)) position += 1;
		if (position === source.length) break;

		const nameMatch = /^[a-z][a-z0-9:-]*/i.exec(source.slice(position));
		if (!nameMatch) throw new Error('The SVG contains malformed attributes.');

		const name = nameMatch[0].toLowerCase();
		if (seenNames.has(name) || !ALLOWED_ATTRIBUTES.has(name)) {
			throw new Error(`Unsupported or duplicate SVG attribute: ${name}.`);
		}
		seenNames.add(name);
		position += nameMatch[0].length;

		while (position < source.length && /\s/.test(source[position]!)) position += 1;
		if (source[position] !== '=') {
			throw new Error('The SVG contains malformed attributes.');
		}
		position += 1;
		while (position < source.length && /\s/.test(source[position]!)) position += 1;

		const quote = source[position];
		if (quote !== '"' && quote !== "'") {
			throw new Error('The SVG contains malformed attributes.');
		}
		position += 1;
		const valueStart = position;
		while (position < source.length && source[position] !== quote) position += 1;
		if (position >= source.length) {
			throw new Error('The SVG contains malformed attributes.');
		}

		const attributeValue = source.slice(valueStart, position);
		if (!isSafeAttributeValue(name, attributeValue)) {
			throw new Error(`Invalid value for SVG attribute: ${name}.`);
		}

		const normalizedValue =
			name === 'fill' || name === 'stroke'
				? attributeValue.toLowerCase()
				: attributeValue;
		safeAttributes.push(`${name}="${escapeAttribute(normalizedValue)}"`);
		position += 1;
		if (position < source.length && !/\s/.test(source[position]!)) {
			throw new Error('The SVG contains malformed attributes.');
		}
	}

	return safeAttributes.join(' ');
}

function isSafeAttributeValue(name: string, value: string): boolean {
	if (
		value.length > MAX_ATTRIBUTE_VALUE_LENGTH ||
		/[<>`&]/.test(value) ||
		[...value].some(isXmlControl)
	) {
		return false;
	}

	if (name === 'd') {
		return (
			/^[Mm][MmLlHhVvCcSsQqTtAaZz0-9eE+\-.,\s]*$/.test(value) &&
			hasBoundedNumbers(value)
		);
	}

	if (name === 'points') {
		return /^[0-9eE+\-.,\s]+$/.test(value) && hasBoundedNumbers(value);
	}

	if (name === 'fill' || name === 'stroke') {
		return ALLOWED_COLORS.has(value.toLowerCase());
	}

	if (name === 'stroke-linecap') {
		return ['butt', 'round', 'square'].includes(value);
	}

	if (name === 'stroke-linejoin') {
		return ['miter', 'round', 'bevel'].includes(value);
	}

	if (name === 'transform') {
		return (
			/^(?:(?:translate|scale|rotate)\([\d\s.,+\-eE]+\)\s*)+$/.test(value) &&
			hasBoundedNumbers(value)
		);
	}

	if (NUMERIC_ATTRIBUTES.has(name)) {
		if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) {
			return false;
		}

		const number = Number(value);
		if (!Number.isFinite(number) || Math.abs(number) > 2_000) return false;
		if (NON_NEGATIVE_ATTRIBUTES.has(name) && number < 0) return false;

		if (
			['opacity', 'fill-opacity', 'stroke-opacity'].includes(name) &&
			(number < 0 || number > 1)
		) {
			return false;
		}

		return true;
	}

	return false;
}

function hasBoundedNumbers(value: string): boolean {
	const numberPattern = /[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
	let count = 0;
	let match: RegExpExecArray | null;

	while ((match = numberPattern.exec(value)) !== null) {
		const number = Number(match[0]);
		if (!Number.isFinite(number) || Math.abs(number) > 2_000) return false;
		count += 1;
	}

	return count > 0;
}

function isXmlControl(character: string): boolean {
	const code = character.charCodeAt(0);
	return code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d;
}

function escapeAttribute(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
