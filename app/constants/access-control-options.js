import {
	DIVISION_ACCESS_MODES,
	DIVISION_ACCESS_MODE_LABELS,
	USER_ROLES,
	USER_ROLE_LABELS
} from '@/lib/security-constants';

export const USER_ROLE_OPTIONS = USER_ROLES.map((value) => ({
	value,
	label: USER_ROLE_LABELS[value]
}));

export const DIVISION_ACCESS_MODE_OPTIONS = DIVISION_ACCESS_MODES.map((value) => ({
	value,
	label: DIVISION_ACCESS_MODE_LABELS[value]
}));

export function roleLabel(value) {
	return USER_ROLE_LABELS[value] || value || '-';
}

export function divisionAccessModeLabel(value) {
	return DIVISION_ACCESS_MODE_LABELS[value] || value || '-';
}
