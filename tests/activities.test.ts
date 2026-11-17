import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dispatchActivityActions } from '../lib/activities/actionDispatch';
import { activityRegistry } from '../lib/activities/catalog';
import {
	ActivityRegistryError,
	createActivityRegistry,
} from '../lib/activities/registry';
import { feelingsActivity } from '../lib/activities/feelings';
import type { ActivityAction } from '../lib/activities/types';
import { isRecord } from '../lib/chat/validation';

describe('activity registry', () => {
	it('resolves known activity state and exposes its context and tools', () => {
		const activity = activityRegistry.resolve({
			activityId: 'feelings',
			state: { selectedMoodId: 'worried' },
		});

		assert.match(activity.description, /Currently selected: Worried/);
		assert.deepEqual(
			activity.tools.map((tool) => tool.name),
			['select_mood'],
		);
	});

	it('rejects unknown activity IDs and invalid activity state', () => {
		assert.throws(
			() =>
				activityRegistry.resolve({
					activityId: 'unknown-tool',
					state: {},
				}),
			ActivityRegistryError,
		);
		assert.throws(
			() =>
				activityRegistry.resolve({
					activityId: 'feelings',
					state: { selectedMoodId: 'not-a-feeling' },
				}),
			ActivityRegistryError,
		);
		assert.throws(
			() =>
				activityRegistry.resolve({
					activityId: 'feelings',
					state: {},
				}),
			ActivityRegistryError,
		);
	});

	it('resolves whiteboard state and exposes the SVG drawing tool', () => {
		const activity = activityRegistry.resolve({
			activityId: 'whiteboard',
			state: { hasContent: true },
		});

		assert.match(activity.description, /already has content/);
		assert.match(activity.description, /directly asks/);
		assert.match(activity.description, /small, friendly SVG doodle/);
		assert.deepEqual(
			activity.tools.map((tool) => tool.name),
			['replace_whiteboard_with_svg'],
		);
		assert.equal(activity.tools[0]?.mockInput, undefined);
		const schema = activity.tools[0]?.inputSchema;
		assert.ok(schema?.type === 'object');
		assert.deepEqual(schema.properties.svg, {
			type: 'string',
			description: 'One complete, static SVG doodle document.',
			minLength: 1,
			maxLength: 12_000,
		});
		assert.deepEqual(schema.properties.spokenText, {
			type: 'string',
			description:
				'A short first-person line the client can say about the doodle.',
			minLength: 1,
			maxLength: 180,
		});
	});

	it('rejects invalid whiteboard snapshots', () => {
		for (const state of [
			{},
			{ hasContent: 'yes' },
			{ hasContent: true, count: 3 },
		])
			assert.throws(
				() => activityRegistry.resolve({ activityId: 'whiteboard', state }),
				ActivityRegistryError,
			);
	});

	it('rejects duplicate tool names in an activity definition', () => {
		const tool = feelingsActivity.tools[0];
		assert.ok(tool);

		assert.throws(
			() =>
				createActivityRegistry([
					{
						...feelingsActivity,
						tools: [tool, tool],
					},
				]),
			ActivityRegistryError,
		);
	});

	it('validates registered tool input before creating an action', () => {
		assert.deepEqual(
			activityRegistry.validateAction('feelings', 'select_mood', {
				moodId: 'worried',
				rationale: 'I have a lot on my mind.',
			}),
			{
				activityId: 'feelings',
				tool: 'select_mood',
				input: {
					type: 'select_mood',
					moodId: 'worried',
					rationale: 'I have a lot on my mind.',
				},
			},
		);
		assert.throws(
			() =>
				activityRegistry.validateAction('feelings', 'select_mood', {
					moodId: 'invented',
					rationale: 'A feeling outside the chart.',
				}),
			ActivityRegistryError,
		);
	});

	it('accepts sanitized whiteboard SVG actions and rejects unsupported fields', () => {
		const input = {
			svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 350"><circle cx="20" cy="20" r="10" /></svg>',
			spokenText: 'I drew how that felt.',
		};
		const action = activityRegistry.validateAction(
			'whiteboard', 'replace_whiteboard_with_svg', input,
		);
		assert.equal(action.tool, 'replace_whiteboard_with_svg');
		assert.ok(isRecord(action.input));
		assert.match(String(action.input.svg), /<circle/);
		assert.throws(
			() =>
				activityRegistry.validateAction(
					'whiteboard',
					'replace_whiteboard_with_svg',
					{ ...input, extra: true },
				),
			/unsupported field/,
		);
	});
});

describe('activity action dispatch', () => {
	it('dispatches only to the captured active activity instance', () => {
		const received: ActivityAction[] = [];
		const captured = {
			activityId: 'feelings',
			onAction: (action: ActivityAction) => received.push(action),
		};
		const other = {
			activityId: 'chess',
			onAction: (action: ActivityAction) => received.push(action),
		};
		const moodAction: ActivityAction = {
			activityId: 'feelings',
			tool: 'select_mood',
			input: { moodId: 'worried' },
		};

		dispatchActivityActions(captured, captured, [moodAction]);
		dispatchActivityActions(other, captured, [moodAction]);

		assert.deepEqual(received, [moodAction]);
	});

	it('does not apply a doodle after leaving the whiteboard', () => {
		const received: ActivityAction[] = [];
		const whiteboard = {
			activityId: 'whiteboard',
			onAction: (action: ActivityAction) => received.push(action),
		};
		const feelings = {
			activityId: 'feelings',
			onAction: (action: ActivityAction) => received.push(action),
		};
		const svgAction: ActivityAction = {
			activityId: 'whiteboard',
			tool: 'replace_whiteboard_with_svg',
			input: { svg: '<svg />', spokenText: 'A small drawing.' },
		};

		dispatchActivityActions(whiteboard, whiteboard, [svgAction]);
		dispatchActivityActions(feelings, whiteboard, [svgAction]);

		assert.deepEqual(received, [svgAction]);
	});
});
