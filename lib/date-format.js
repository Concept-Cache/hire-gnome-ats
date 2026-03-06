export function formatDateTimeAt(value) {
	if (!value) return '-';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '-';
	const datePart = date.toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'numeric',
		day: 'numeric'
	});
	const timePart = date.toLocaleTimeString(undefined, {
		hour: 'numeric',
		minute: '2-digit'
	});
	return `${datePart} @ ${timePart}`;
}
