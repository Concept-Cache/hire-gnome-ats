import { PrismaClient } from '@prisma/client';
import { createRecordId, getRecordIdPrefix } from './record-id';

const globalForPrisma = globalThis;

function withRecordId(data, modelName) {
	if (!data || typeof data !== 'object') return data;
	if (Array.isArray(data)) {
		return data.map((item) => withRecordId(item, modelName));
	}
	if (data.recordId) return data;

	const prefix = getRecordIdPrefix(modelName);
	if (!prefix) return data;
	return {
		...data,
		recordId: createRecordId(prefix)
	};
}

const prismaClient = new PrismaClient({
	log: ['error']
}).$extends({
	query: {
		$allModels: {
			async create({ model, args, query }) {
				return query({
					...args,
					data: withRecordId(args?.data, model)
				});
			},
			async createMany({ model, args, query }) {
				return query({
					...args,
					data: withRecordId(args?.data, model)
				});
			},
			async upsert({ model, args, query }) {
				return query({
					...args,
					create: withRecordId(args?.create, model)
				});
			}
		}
	}
});

export const prisma =
	globalForPrisma.prisma ||
	prismaClient;

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
