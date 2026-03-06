# Contributing

Thanks for contributing to Hire Gnome ATS.

## Prerequisites
- Node.js `20.x` (see `.nvmrc`)
- npm `10+`
- MySQL `8+` (local) or Docker (`docker-compose.dev.yml`)

## Local Setup
1. Fork and clone your fork.
2. Install dependencies:
	```bash
	npm install
	```
3. Copy environment file:
	```bash
	cp .env.example .env
	```
4. Start database (choose one):
	- Local MySQL and create `ats` DB
	- Docker:
		```bash
		npm run db:up
		```
5. Bootstrap migrations:
	```bash
	npm run bootstrap
	```
6. Start app:
	```bash
	npm run dev
	```

## Branch + PR Rules
- Keep PRs focused and small.
- Use clear commit messages.
- Include screenshots for UI changes.
- Mention DB schema/migration impact clearly.

## Checks Before PR
```bash
npm run ci:preflight
npm run build
```

## Coding Style
- Use tabs for indentation.
- Preserve existing architecture patterns.
- Avoid unrelated refactors in feature PRs.

## Migrations
- If you change Prisma schema, include a migration.
- Never edit already-applied migration files.
- For local drift in development only:
	```bash
	npx prisma migrate reset
	```
