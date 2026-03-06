'use client';

import { useCallback, useMemo } from 'react';
import TypeaheadSelect from '@/app/components/typeahead-select';
import { fetchLookupOptionById, fetchLookupOptionsPage } from '@/lib/lookup-client';

const MIN_SEARCH_CHARS_BY_ENTITY = {
	candidates: 2,
	users: 2,
	contacts: 2,
	'job-orders': 2,
	clients: 2
};

export default function LookupTypeaheadSelect({
	entity,
	lookupParams = {},
	limit = 20,
	page = 1,
	minSearchChars,
	...props
}) {
	const lookupParamsKey = useMemo(() => JSON.stringify(lookupParams || {}), [lookupParams]);
	const resolvedMinSearchChars = useMemo(() => {
		if (typeof minSearchChars === 'number' && minSearchChars >= 0) {
			return minSearchChars;
		}

		return MIN_SEARCH_CHARS_BY_ENTITY[entity] ?? 0;
	}, [entity, minSearchChars]);

	const stableLookupParams = useMemo(() => {
		try {
			return JSON.parse(lookupParamsKey || '{}');
		} catch {
			return {};
		}
	}, [lookupParamsKey]);

	const loadOptions = useCallback(
		(query, nextPage = page) =>
			fetchLookupOptionsPage(entity, {
				query,
				limit,
				page: nextPage,
				params: stableLookupParams
			}),
		[entity, limit, page, stableLookupParams]
	);

	const loadOptionByValue = useCallback(
		(value) =>
			fetchLookupOptionById(entity, value, {
				params: stableLookupParams
			}),
		[entity, stableLookupParams]
	);

	return (
		<TypeaheadSelect
			{...props}
			options={[]}
			minSearchChars={resolvedMinSearchChars}
			loadOptions={loadOptions}
			loadOptionByValue={loadOptionByValue}
			loadDeps={[lookupParamsKey, entity]}
		/>
	);
}
