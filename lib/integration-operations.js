function parseBooleanEnv(value, fallback = true) {
	if (value == null) return fallback;
	const normalized = String(value).trim().toLowerCase();
	if (!normalized) return fallback;
	if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
	if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
	return fallback;
}

export function getBullhornOperationsEnabled() {
	return parseBooleanEnv(
		process.env.BULLHORN_OPERATIONS_ENABLED ?? process.env.NEXT_PUBLIC_BULLHORN_OPERATIONS_ENABLED,
		true
	);
}

export function getZohoRecruitOperationsEnabled() {
	return parseBooleanEnv(
		process.env.ZOHO_RECRUIT_OPERATIONS_ENABLED ?? process.env.NEXT_PUBLIC_ZOHO_RECRUIT_OPERATIONS_ENABLED,
		true
	);
}

export function getIntegrationOperationFlags() {
	return {
		bullhornOperationsEnabled: getBullhornOperationsEnabled(),
		zohoRecruitOperationsEnabled: getZohoRecruitOperationsEnabled()
	};
}
