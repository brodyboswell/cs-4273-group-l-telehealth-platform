'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import '@excalidraw/excalidraw/index.css';
import type {
	ExcalidrawImperativeAPI,
	ExcalidrawProps,
} from '@excalidraw/excalidraw/types';
import { useActivityTools } from '@/components/session/ActivityBridge';
import { Icon } from '@/components/ui/Icon';
import type { ActivityAction } from '@/lib/activities/types';
import { WHITEBOARD_DOODLE_COLORS } from '@/lib/whiteboard/palette';

type ExcalidrawComponent = typeof import('@excalidraw/excalidraw').Excalidraw;

export function preloadWhiteboardEditor() {
	return import('@excalidraw/excalidraw');
}

const TOOLS = [
	{ type: 'freedraw', label: 'Draw', icon: 'pen' },
	{ type: 'eraser', label: 'Erase', icon: 'eraser' },
	{ type: 'selection', label: 'Move', icon: 'pointer' },
	{ type: 'text', label: 'Write', icon: 'text' },
	{ type: 'rectangle', label: 'Box', icon: 'rectangle' },
	{ type: 'ellipse', label: 'Circle', icon: 'ellipse' },
] as const;

export function WhiteboardCanvas() {
	const [Excalidraw, setExcalidraw] = useState<ExcalidrawComponent | null>(
		null,
	);
	const [editorError, setEditorError] = useState(false);
	const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
	const [hasContent, setHasContent] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);
	const [{ activeTool, color, strokeWidth }, setControls] = useState({
		activeTool: 'freedraw',
		color: WHITEBOARD_DOODLE_COLORS[0].value as string,
		strokeWidth: 2,
	});

	useEffect(() => {
		let isActive = true;

		preloadWhiteboardEditor()
			.then((module) => {
				if (isActive) setExcalidraw(() => module.Excalidraw);
			})
			.catch(() => {
				if (isActive) setEditorError(true);
			});

		return () => {
			isActive = false;
		};
	}, []);

	const handleChange = useCallback<NonNullable<ExcalidrawProps['onChange']>>(
		(elements, state) => {
			const next = {
				activeTool: state.activeTool.type,
				color: state.currentItemStrokeColor,
				strokeWidth: state.currentItemStrokeWidth,
			};
			// Pointer movement changes the scene frequently, but usually not the toolbar.
			setControls((previous) =>
				previous.activeTool === next.activeTool &&
				previous.color === next.color &&
				previous.strokeWidth === next.strokeWidth
					? previous
					: next,
			);
			const nextHasContent = elements.some((element) => !element.isDeleted);
			setHasContent((previous) =>
				previous === nextHasContent ? previous : nextHasContent,
			);
		},
		[],
	);

	const state = useMemo(() => ({ hasContent }), [hasContent]);
	const handleAction = useCallback((action: ActivityAction) => {
		if (
			action.activityId !== 'whiteboard' ||
			action.tool !== 'replace_whiteboard_with_svg'
		)
			return;

		// SVG insertion is deferred to implementation-plan section 6.4.
		setActionError('Client-generated drawings are not available yet.');
	}, []);

	// Register even while the editor's client-only bundle is loading.
	useActivityTools('whiteboard', state, handleAction);

	return (
		<div className="kid-whiteboard flex h-full flex-col gap-3 bg-charcoal p-3 sm:p-5">
			<div
				className="flex shrink-0 flex-wrap items-center gap-3 rounded-2xl bg-cream p-3"
				aria-label="Whiteboard tools"
			>
				<div
					className="grid w-full grid-cols-3 gap-1 sm:flex sm:w-auto sm:flex-wrap"
					role="group"
					aria-label="Drawing tools"
				>
					{TOOLS.map((tool) => (
						<button
							key={tool.type}
							type="button"
							disabled={!api}
							aria-pressed={activeTool === tool.type}
							onClick={() => {
								api?.setActiveTool({
									type: tool.type,
									locked: tool.type !== 'selection',
								});
							}}
							className={`flex min-h-14 min-w-14 flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-1 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal disabled:opacity-40 ${activeTool === tool.type ? 'border-charcoal bg-sage/25 text-charcoal' : 'border-transparent text-charcoal hover:bg-sage/15'}`}
						>
							<Icon name={tool.icon} width="24" height="24" />
							{tool.label}
						</button>
					))}
				</div>
				<div
					className="flex flex-wrap items-center gap-1 sm:gap-2 sm:border-l sm:border-charcoal/15 sm:pl-3"
					role="group"
					aria-label="Ink colors"
				>
					{WHITEBOARD_DOODLE_COLORS.map((ink) => (
						<button
							key={ink.value}
							type="button"
							disabled={!api}
							aria-label={ink.name}
							aria-pressed={color === ink.value}
							title={ink.name}
							onClick={() => {
								api?.updateScene({
									appState: { currentItemStrokeColor: ink.value },
								});
							}}
							className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal disabled:opacity-40 ${color === ink.value ? 'border-charcoal ring-2 ring-white' : 'border-white'}`}
							style={{ backgroundColor: ink.value }}
						>
							{color === ink.value && <Icon name="check" />}
						</button>
					))}
				</div>
				<label className="flex items-center gap-2 text-sm font-medium text-charcoal">
					Line
					<select
						disabled={!api}
						value={strokeWidth}
						onChange={(event) =>
							api?.updateScene({
								appState: {
									currentItemStrokeWidth: Number(event.target.value),
								},
							})
						}
						className="min-h-10 rounded-lg border border-charcoal/20 bg-white px-2"
						aria-label="Line size"
					>
						<option value={1}>Thin</option>
						<option value={2}>Medium</option>
						<option value={4}>Thick</option>
					</select>
				</label>
			</div>
			{actionError && (
				<p
					className="rounded-xl bg-terracotta/15 px-3 py-2 text-sm text-white"
					role="alert"
				>
					{actionError}
				</p>
			)}
			<div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-white">
				{Excalidraw ? (
					<Excalidraw
						excalidrawAPI={setApi}
						initialData={{
							appState: {
								activeTool: {
									type: 'freedraw',
									locked: true,
									lastActiveTool: null,
									customType: null,
								},
								currentItemStrokeColor: WHITEBOARD_DOODLE_COLORS[0].value,
								currentItemStrokeWidth: 2,
								viewBackgroundColor: '#ffffff',
							},
						}}
						onChange={handleChange}
						UIOptions={{
							canvasActions: {
								changeViewBackgroundColor: false,
								loadScene: false,
								saveToActiveFile: false,
								toggleTheme: false,
								export: false,
							},
							tools: { image: false },
						}}
					/>
				) : (
					<div
						role={editorError ? 'alert' : 'status'}
						className="flex h-full items-center justify-center px-4 text-center text-charcoal/60"
					>
						{editorError
							? 'The whiteboard editor could not be loaded.'
							: 'Getting your board ready…'}
					</div>
				)}
			</div>
		</div>
	);
}
