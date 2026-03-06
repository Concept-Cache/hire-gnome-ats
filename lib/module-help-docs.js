import 'server-only';

import path from 'path';
import { readFile } from 'node:fs/promises';
import { MODULE_HELP_BY_SLUG } from '@/app/constants/module-help';

const MODULE_DOCS_DIR = path.join(process.cwd(), 'docs', 'modules');

export function getModuleHelpMetaBySlug(moduleSlug) {
	return MODULE_HELP_BY_SLUG[String(moduleSlug || '').trim()] || null;
}

export async function getModuleHelpBySlug(moduleSlug) {
	const meta = getModuleHelpMetaBySlug(moduleSlug);
	if (!meta) return null;
	const filePath = path.join(MODULE_DOCS_DIR, meta.docFile);
	try {
		const markdown = await readFile(filePath, 'utf8');
		return {
			...meta,
			markdown
		};
	} catch {
		return null;
	}
}
