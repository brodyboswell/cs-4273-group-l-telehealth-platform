'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@excalidraw/excalidraw/index.css';
import type {
	DataURL,
	ExcalidrawImperativeAPI,
	ExcalidrawProps,
} from '@excalidraw/excalidraw/types';
import type { FileId } from '@excalidraw/excalidraw/element/types';
import { useActivityTools } from '@/components/session/ActivityBridge';
import { Icon } from '@/components/ui/Icon';
import type { ActivityAction } from '@/lib/activities/types';
import { createDrawAnimation } from '@/lib/whiteboard/createDrawAnimation';
import { WHITEBOARD_DOODLE_COLORS } from '@/lib/whiteboard/palette';
import { sanitizeWhiteboardSvg } from '@/lib/whiteboard/sanitizeSvg';

type ExcalidrawComponent = typeof import('@excalidraw/excalidraw').Excalidraw;

interface SvgImageLayout {
	x: number;
	y: number;
	width: number;
	height: number;
	displayWidth: number;
	displayHeight: number;
}

interface BoardAnimation {
	markup: string;
	durationMs: number;
	width: number;
	height: number;
}

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
	const [clientStatus, setClientStatus] = useState<string | null>(null);
	const [animation, setAnimation] = useState<BoardAnimation | null>(null);
	const isMounted = useRef(false);
	const drawSequence = useRef(0);
	const [{ activeTool, color, strokeWidth }, setControls] = useState({
		activeTool: 'freedraw',
		color: WHITEBOARD_DOODLE_COLORS[0].value as string,
		strokeWidth: 2,
	});

	useEffect(() => {
		let isActive = true;
		isMounted.current = true;

		preloadWhiteboardEditor()
			.then((module) => {
				if (isActive) setExcalidraw(() => module.Excalidraw);
			})
			.catch(() => {
				if (isActive) setEditorError(true);
			});

		return () => {
			isActive = false;
			isMounted.current = false;
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
	const handleAction = useCallback(
		(action: ActivityAction) => {
			if (
				action.activityId !== 'whiteboard' ||
				action.tool !== 'replace_whiteboard_with_svg'
			) {
				return;
			}

			setActionError(null);
			setClientStatus(null);
			if (!api) {
				setActionError(
					'The whiteboard is still loading. Please try again shortly.',
				);
				return;
			}

			let svg: string;
			try {
				if (!isRecord(action.input) || typeof action.input.svg !== 'string') {
					throw new Error('The client returned an invalid SVG drawing.');
				}

				// Recheck the server-sanitized action at the browser rendering boundary.
				svg = sanitizeWhiteboardSvg(action.input.svg);
			} catch (error) {
				setActionError(
					error instanceof Error
						? error.message
						: 'The client returned an invalid SVG drawing.',
				);
				return;
			}

			let layout: SvgImageLayout;
			try {
				layout = getSvgImageLayout(api);
			} catch (error) {
				setActionError(
					error instanceof Error
						? error.message
						: 'Could not place the client drawing on the whiteboard.',
				);
				return;
			}

			const sequence = ++drawSequence.current;
			void animateAndAddSvgImage(
				api,
				svg,
				layout,
				() => isMounted.current && drawSequence.current === sequence,
				setAnimation,
				() => setClientStatus('The client added a drawing to the whiteboard.'),
				(error) =>
					setActionError(
						error instanceof Error
							? error.message
							: 'Could not add the client drawing.',
					),
			);
		},
		[api],
	);

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
				{actionError && (
					<p
						className="absolute left-3 right-3 top-3 z-20 rounded-xl bg-terracotta/15 px-3 py-2 text-sm text-charcoal"
						role="alert"
					>
						{actionError}
					</p>
				)}
				{clientStatus && (
					<p
						className="absolute bottom-3 left-3 right-3 z-20 rounded-xl bg-sage/90 px-3 py-2 text-sm text-charcoal"
						role="status"
					>
						{clientStatus}
					</p>
				)}
				{animation && (
					<div
						className="pointer-events-none absolute inset-0 z-10 grid cursor-wait place-items-center"
						aria-hidden="true"
					>
						<div
							className="svg-animation-art pointer-events-none max-h-full max-w-full"
							style={{ width: animation.width, height: animation.height }}
							dangerouslySetInnerHTML={{ __html: animation.markup }}
						/>
					</div>
				)}
			</div>
		</div>
	);
}

function getSvgImageLayout(api: ExcalidrawImperativeAPI): SvgImageLayout {
	const appState = api.getAppState();
	const zoom = appState.zoom.value || 1;
	const aspectRatio = 500 / 350;
	const visibleWidth = appState.width / zoom;
	const visibleHeight = appState.height / zoom;

	if (
		!Number.isFinite(visibleWidth) ||
		!Number.isFinite(visibleHeight) ||
		visibleWidth <= 0 ||
		visibleHeight <= 0
	) {
		throw new Error('The whiteboard viewport is not ready for a client drawing.');
	}

	const width = Math.min(
		1_000,
		visibleWidth * 0.82,
		visibleHeight * 0.82 * aspectRatio,
	);
	const height = width / aspectRatio;

	return {
		x: -appState.scrollX + visibleWidth / 2 - width / 2,
		y: -appState.scrollY + visibleHeight / 2 - height / 2,
		width,
		height,
		displayWidth: width * zoom,
		displayHeight: height * zoom,
	};
}

async function addSvgImage(
	api: ExcalidrawImperativeAPI,
	svg: string,
	layout: SvgImageLayout,
	isActive: () => boolean,
): Promise<void> {
	const { CaptureUpdateAction, convertToExcalidrawElements } =
		await preloadWhiteboardEditor();

	if (!isActive()) return;

	const fileId = `llm-svg-${crypto.randomUUID()}` as FileId;
	const svgBytes = new TextEncoder().encode(svg);
	const binarySvg = Array.from(svgBytes, (byte) =>
		String.fromCharCode(byte),
	).join('');
	const dataURL =
		`data:image/svg+xml;base64,${btoa(binarySvg)}` as DataURL;

	api.addFiles([
		{
			id: fileId,
			mimeType: 'image/svg+xml',
			dataURL,
			created: Date.now(),
		},
	]);

	const image = convertToExcalidrawElements(
		[
			{
				type: 'image',
				fileId,
				x: layout.x,
				y: layout.y,
				width: layout.width,
				height: layout.height,
				status: 'saved',
			},
		],
		{ regenerateIds: true },
	);

	api.updateScene({
		elements: image,
		captureUpdate: CaptureUpdateAction.IMMEDIATELY,
	});

	api.scrollToContent(image, { fitToContent: true, animate: true });
}

async function animateAndAddSvgImage(
	api: ExcalidrawImperativeAPI,
	svg: string,
	layout: SvgImageLayout,
	isActive: () => boolean,
	setAnimation: (animation: BoardAnimation | null) => void,
	onApplied: () => void,
	onError: (error: unknown) => void,
): Promise<void> {
	try {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			setAnimation(null);
		} else {
			const drawAnimation = createDrawAnimation(svg);
			setAnimation({
				...drawAnimation,
				width: layout.displayWidth,
				height: layout.displayHeight,
			});
			await waitForPaint();
			await wait(drawAnimation.durationMs);
			if (!isActive()) return;
		}

		setAnimation(null);
		await addSvgImage(api, svg, layout, isActive);
		if (!isActive()) return;
		onApplied();
	} catch (error) {
		if (!isActive()) return;
		setAnimation(null);
		onError(error);
	}
}

function waitForPaint(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
	});
}

function wait(durationMs: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
