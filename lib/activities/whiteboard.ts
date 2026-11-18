import { WHITEBOARD_DOODLE_COLORS } from '@/lib/whiteboard/palette';
import {
	MAX_WHITEBOARD_SPOKEN_TEXT_LENGTH,
	MAX_WHITEBOARD_SVG_LENGTH,
	sanitizeWhiteboardSvg,
} from '@/lib/whiteboard/sanitizeSvg';
import {
	defineActivity,
	type ActivityDefinition,
	type ActivityTool,
} from './types';

interface WhiteboardState {
	hasContent: boolean;
}

/** Validated input for a virtual-client SVG drawing action. */
export interface WhiteboardSvgAction {
	svg: string;
	spokenText: string;
}

function parseWhiteboardState(value: unknown): WhiteboardState {
	if (!isRecord(value) || typeof value.hasContent !== 'boolean')
		throw new Error('Expected a whiteboard state with a content flag.');

	if (Object.keys(value).some((key) => key !== 'hasContent'))
		throw new Error('Whiteboard state contains an unsupported field.');

	return { hasContent: value.hasContent };
}

const palette = WHITEBOARD_DOODLE_COLORS.map(({ value }) => value).join(', ');

/** Face-feature examples use the same head and eye positions in a 500×350 viewBox. */
export const FACE_EXAMPLES = {
	happy: '<path d="M 210 220 Q 250 260 290 220"/>',
	sad: '<path d="M 210 230 Q 250 200 290 230"/>',
	angry: '<path d="M 190 120 L 225 135 M 275 135 L 310 120 M 210 230 Q 250 200 290 230"/>',
	worried: '<path d="M 190 135 L 225 120 M 275 120 L 310 135 M 210 230 Q 250 210 290 230"/>',
} as const;

const drawingGuidance = [
	'Create one small, childlike SVG doodle for an educational telehealth whiteboard tool.',
	'Make it rudimentary, like a quick sketch someone could draw by hand in a few seconds.',
	'Use a few simple shapes or strokes, with minimal detail; include enough features to make the intended expression clear.',
	'Make it recognizable without making it polished or realistic; avoid shading, textures, tiny details, and decorative backgrounds.',
	'Use a 500 by 350 viewBox and keep the drawing inside it.',
	'Use only g, path, rect, circle, ellipse, line, polyline, and polygon elements.',
	'Do not fill shapes with color; use outlines and apply palette colors only to strokes.',
	'Do not use text, scripts, stylesheets, filters, gradients, masks, clip paths, images, links, animation, or external resources.',
	'Do not include XML comments, declarations, CDATA, or any markup other than the SVG root and the listed shapes. Do not put labels or explanatory text inside the SVG.',
	`Use colors from this palette: ${palette}.`,
	'When drawing emotions, use forest (#293c35) for a neutral feeling, sage (#88a294) or lilac (#a990b9) for sadness, butter yellow (#e6ca79) for happiness, and apricot (#c97c63) for anger.',
	'The drawing and spokenText must describe the same subject and feeling. Do not describe features that are absent from the drawing.',
	'For a situation or object, draw a simple recognizable object or scene relevant to the conversation rather than substituting a face. Stick figures, a table, food, and simple objects can be built with circles, lines, rectangles, and paths.',
	'For example, a simple lunch scene can use this complete SVG: <svg viewBox="0 0 500 350"><g fill="none" stroke="#293c35" stroke-width="4"><rect x="140" y="190" width="220" height="20"/><line x1="160" y1="210" x2="160" y2="280"/><line x1="340" y1="210" x2="340" y2="280"/><ellipse cx="250" cy="180" rx="35" ry="10"/><circle cx="190" cy="105" r="18"/><path d="M 190 123 L 190 170 M 165 145 L 215 145"/></g></svg>. Adapt it to the situation, do not copy it when it is unrelated.',
	'For emotion faces, SVG x increases rightward and y increases downward. Place both eyebrows inside the face above the eyes; show a frown or straight mouth for anger, never a smile.',
	'These example path fragments are features, not complete SVG documents. For each example, use a circle centered at (250,175) with radius 120 for the head and eyes centered at (210,150) and (290,150). Apply fill="none", an appropriate palette stroke color, and stroke-width="4" to the shapes or their group.',
	`Happy mouth (center below corners, a smile): ${FACE_EXAMPLES.happy}`,
	`Sad mouth (center above corners, a frown): ${FACE_EXAMPLES.sad}`,
	`Angry eyebrows (inner ends lower) and frown: ${FACE_EXAMPLES.angry}`,
	`Worried eyebrows (inner ends higher) and frown: ${FACE_EXAMPLES.worried}`,
	'Adapt the examples when useful, but do not force a face for other drawing requests. Before calling the tool, check that the visible geometry and spokenText match the requested feeling.',
].join(' ');

/** Builds the action parser around the sanitizer used at the trust boundary. */
export function createWhiteboardSvgActionParser(
	sanitizeSvg: (svg: string) => string,
) {
	return function parseWhiteboardSvgAction(
		value: unknown,
	): WhiteboardSvgAction {
		if (!isRecord(value)) throw new Error('Expected a whiteboard SVG action.');

		if (Object.keys(value).some((key) => !['svg', 'spokenText'].includes(key)))
			throw new Error('Whiteboard SVG action contains an unsupported field.');

		if (typeof value.svg !== 'string' || !value.svg.trim())
			throw new Error('The drawing must include an SVG document.');

		if (value.svg.length > MAX_WHITEBOARD_SVG_LENGTH)
			throw new Error('The generated SVG is too large. Try a simpler doodle.');

		if (
			typeof value.spokenText !== 'string' ||
			!value.spokenText.trim() ||
			value.spokenText.trim().length > MAX_WHITEBOARD_SPOKEN_TEXT_LENGTH
		)
			throw new Error('The client drawing needs a short spoken description.');

		return {
			svg: sanitizeSvg(value.svg),
			spokenText: value.spokenText.trim(),
		};
	};
}

const parseWhiteboardSvgAction = createWhiteboardSvgActionParser(
	sanitizeWhiteboardSvg,
);

const whiteboardSvgTool: ActivityTool<WhiteboardSvgAction> = {
	name: 'replace_whiteboard_with_svg',
	description: [
		'Use only after the learner directly asks you or clearly agrees to a drawing.',
		'When the learner asks you to draw, redraw, or try a drawing again, call this tool to actually make the drawing, even if you drew something earlier or the board was cleared.',
		'Never say you drew or changed the whiteboard unless you make this tool call in the current response. If you are unsure what the learner wants, ask instead.',
		'Draw one relevant feeling, event, or idea already discussed, or what the learner prompted you to draw.',
		'Always include a complete, non-empty SVG document in the svg field. Never omit it or send an empty string.',
		drawingGuidance,
		'Put the complete SVG document in the svg field, with no Markdown fences or explanation in that field.',
		'This action replaces the entire whiteboard.',
	].join(' '),
	inputSchema: {
		type: 'object',
		properties: {
			svg: {
				type: 'string',
				description: 'One complete, static SVG doodle document.',
				minLength: 1,
				maxLength: MAX_WHITEBOARD_SVG_LENGTH,
			},
			spokenText: {
				type: 'string',
				description:
					'A short first-person line the client can say about the doodle.',
				minLength: 1,
				maxLength: MAX_WHITEBOARD_SPOKEN_TEXT_LENGTH,
			},
		},
		required: ['svg', 'spokenText'],
		additionalProperties: false,
	},
	parseInput: parseWhiteboardSvgAction,
};

const definition: ActivityDefinition<WhiteboardState> = {
	id: 'whiteboard',
	label: 'whiteboard',
	parseState: parseWhiteboardState,
	describeState: ({ hasContent }) =>
		[
			'The learner is using a shared whiteboard as part of this conversation.',
			`The board ${hasContent ? 'already has content' : 'is blank'}.`,
			'Draw only after the learner directly asks you or clearly agrees to a drawing.',
			'A message alone cannot change the board: use replace_whiteboard_with_svg when asked to draw or redraw, and never claim you drew without calling it in this response.',
			'The drawing replaces the whole board, including the learner’s existing marks.',
		].join(' '),
	tools: [whiteboardSvgTool],
};

export const whiteboardActivity = defineActivity(definition);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
