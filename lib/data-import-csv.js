export function normalizeHeaderKey(value) {
	return String(value || '')
		.replace(/^\ufeff/, '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '');
}

export function parseCsvText(rawText) {
	const allRows = [];
	let row = [];
	let field = '';
	let inQuotes = false;

	function pushField() {
		row.push(field);
		field = '';
	}

	function pushRow() {
		if (row.length === 1 && row[0] === '') {
			row = [];
			return;
		}
		allRows.push(row);
		row = [];
	}

	for (let i = 0; i < rawText.length; i += 1) {
		const char = rawText[i];
		if (inQuotes) {
			if (char === '"') {
				if (rawText[i + 1] === '"') {
					field += '"';
					i += 1;
				} else {
					inQuotes = false;
				}
			} else {
				field += char;
			}
			continue;
		}

		if (char === '"') {
			inQuotes = true;
			continue;
		}
		if (char === ',') {
			pushField();
			continue;
		}
		if (char === '\n' || char === '\r') {
			pushField();
			pushRow();
			if (char === '\r' && rawText[i + 1] === '\n') {
				i += 1;
			}
			continue;
		}
		field += char;
	}

	pushField();
	if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
		pushRow();
	}

	if (allRows.length <= 1) {
		throw new Error('CSV file must include a header row and at least one data row.');
	}

	const headers = allRows[0].map((value, index) => {
		const label = String(value || '').replace(/^\ufeff/, '').trim();
		return {
			key: normalizeHeaderKey(label) || `column_${index + 1}`,
			label: label || `Column ${index + 1}`
		};
	});

	const rows = allRows
		.slice(1)
		.map((values) => {
			const normalizedRow = {};
			headers.forEach((header, index) => {
				normalizedRow[header.key] = String(values[index] ?? '').trim();
			});
			return normalizedRow;
		})
		.filter((normalizedRow) =>
			Object.values(normalizedRow).some((value) => String(value || '').trim() !== '')
		);

	if (rows.length <= 0) {
		throw new Error('CSV file contains no data rows.');
	}

	return { headers, rows };
}
