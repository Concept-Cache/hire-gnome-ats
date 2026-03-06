export const DEFAULT_THEME_KEY = 'classic_blue';

export const THEME_OPTIONS = Object.freeze([
	{ value: 'classic_blue', label: 'Classic Blue' },
	{ value: 'emerald', label: 'Emerald' },
	{ value: 'slate', label: 'Slate' },
	{ value: 'sunset', label: 'Sunset' },
	{ value: 'high_contrast', label: 'High Contrast' }
]);

const THEME_KEYS = new Set(THEME_OPTIONS.map((option) => option.value));

export function normalizeThemeKey(value) {
	const normalized = String(value || '').trim().toLowerCase();
	if (THEME_KEYS.has(normalized)) return normalized;
	return DEFAULT_THEME_KEY;
}
