export const DEFAULT_UNASSIGNED_DIVISION_NAME = 'Unassigned';

export async function ensureDefaultUnassignedDivision(dbClient) {
	if (!dbClient?.division) {
		throw new Error('Database client is required to ensure default division.');
	}

	return dbClient.division.upsert({
		where: { name: DEFAULT_UNASSIGNED_DIVISION_NAME },
		update: {},
		create: {
			name: DEFAULT_UNASSIGNED_DIVISION_NAME,
			accessMode: 'COLLABORATIVE'
		}
	});
}

