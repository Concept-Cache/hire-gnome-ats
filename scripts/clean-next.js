#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const nextBuildDir = path.join(projectRoot, '.next');

try {
	fs.rmSync(nextBuildDir, { recursive: true, force: true });
} catch (error) {
	console.warn(`[clean-next] Failed to remove .next directory: ${error?.message || error}`);
}
