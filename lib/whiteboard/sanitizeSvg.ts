/** Maximum SVG payload accepted from the virtual client (provisional). */
export const MAX_WHITEBOARD_SVG_LENGTH = 12_000;

/** Maximum client-facing description attached to an SVG action (provisional). */
export const MAX_WHITEBOARD_SPOKEN_TEXT_LENGTH = 180;

/**
 * Placeholder for the allow-list sanitizer described in the design document.
 * Fail closed until that sanitizer is implemented; never render model SVG as-is.
 */
export function sanitizeWhiteboardSvg(_svg: string): string {
	throw new Error('Whiteboard SVG sanitization is not implemented yet.');
}
