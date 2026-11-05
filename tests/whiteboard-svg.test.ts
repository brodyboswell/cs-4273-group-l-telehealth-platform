import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	createWhiteboardSvgActionParser,
	whiteboardActivity,
} from '../lib/activities/whiteboard';
import {
	MAX_WHITEBOARD_SPOKEN_TEXT_LENGTH,
	MAX_WHITEBOARD_SVG_LENGTH,
} from '../lib/whiteboard/sanitizeSvg';

const parseInput = whiteboardActivity.tools[0]!.parseInput;
const validAction = {
	svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350"><circle cx="20" cy="20" r="10" /></svg>',
	spokenText: 'I drew how that felt.',
};

describe('whiteboard SVG action parser', () => {
	it('accepts a valid action and trims spoken text when a sanitizer is supplied', () => {
		const parseWithTestSanitizer = createWhiteboardSvgActionParser(
			(svg) => `sanitized:${svg}`,
		);

		assert.deepEqual(
			parseWithTestSanitizer({
				...validAction,
				spokenText: '  I drew this.  ',
			}),
			{
				svg: `sanitized:${validAction.svg}`,
				spokenText: 'I drew this.',
			},
		);
	});

	it('rejects malformed payloads and unsupported fields', () => {
		assert.throws(() => parseInput(null), /Expected a whiteboard SVG action/);
		assert.throws(
			() => parseInput({ ...validAction, imageUrl: 'https://example.test' }),
			/unsupported field/,
		);
		assert.throws(
			() => parseInput({ ...validAction, svg: '   ' }),
			/include an SVG document/,
		);
	});

	it('enforces the SVG and spoken-line limits', () => {
		assert.throws(
			() =>
				parseInput({
					...validAction,
					svg: 'x'.repeat(MAX_WHITEBOARD_SVG_LENGTH + 1),
				}),
			/SVG is too large/,
		);
		assert.throws(
			() =>
				parseInput({
					...validAction,
					spokenText: 'x'.repeat(MAX_WHITEBOARD_SPOKEN_TEXT_LENGTH + 1),
				}),
			/short spoken description/,
		);
	});

	it('accepts a valid action after SVG sanitization', () => {
		const parsed = parseInput(validAction);

		assert.equal(parsed.spokenText, validAction.spokenText);
		assert.equal(
			parsed.svg,
			'<svg xmlns="http://www.w3.org/2000/svg" width="500" height="350" viewBox="0 0 500 350"><circle cx="20" cy="20" r="10"/></svg>',
		);
	});
});
