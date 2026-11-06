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

const drawingGuidance = [
	'Create one small, friendly SVG doodle for an educational telehealth whiteboard tool.',
	'Make it rudimentary, like a quick sketch someone could draw by hand in a few seconds.',
	'Use about 3 to 5 simple shapes or strokes, with slightly loose, imperfect lines and minimal detail.',
	'Make it recognizable without making it polished or realistic; avoid shading, textures, tiny details, and decorative backgrounds.',
	'Use a 500 by 350 viewBox and keep the drawing inside it.',
	'Use only g, path, rect, circle, ellipse, line, polyline, and polygon elements.',
	'Do not fill shapes with color; use outlines and apply palette colors only to strokes.',
	'Do not use text, scripts, stylesheets, filters, gradients, masks, clip paths, images, links, animation, or external resources.',
	`Use colors from this palette: ${palette}.`,
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
			drawingGuidance,
			'The drawing replaces the whole board, including the learner’s existing marks.',
		].join(' '),
	tools: [whiteboardSvgTool],
};

export const whiteboardActivity = defineActivity(definition);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
