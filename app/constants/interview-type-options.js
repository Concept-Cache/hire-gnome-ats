export const INTERVIEW_TYPE_OPTIONS = [
	{ value: 'phone', label: 'Phone' },
	{ value: 'video', label: 'Video' },
	{ value: 'in_person', label: 'In Person' }
];

export function normalizeInterviewType(value) {
	const normalized = String(value ?? '').trim().toLowerCase();
	if (normalized === 'phone' || normalized === 'video' || normalized === 'in_person') {
		return normalized;
	}

	if (normalized === 'formal') {
		return 'in_person';
	}

	if (normalized === 'log') {
		return 'phone';
	}

	return 'phone';
}
