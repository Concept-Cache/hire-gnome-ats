# Operations Runbook

## 1) Release Gate (CI)

CI workflow file:
- `.github/workflows/ci.yml`

Jobs:
- `build`: dependency install + production build.
- `api-smoke`: MySQL-backed smoke run:
	- apply migrations
	- start app
	- wait for `/api/health`
	- run permissions smoke tests

Local equivalent:
```bash
npm run ci:preflight
npm ci
npm run ci:build
```

## 2) Backups

### One-off backup
```bash
npm run db:backup
```

### Scheduled backup with retention pruning
```bash
npm run db:backup:scheduled
```

Config:
- `DB_BACKUP_DIR` (default: `.backups`)
- `DB_BACKUP_RETENTION_DAYS` (default: `14`)

### Cron example (daily at 2:15 AM)
```cron
15 2 * * * cd /opt/hire-gnome-ats && /usr/bin/env npm run db:backup:scheduled >> /var/log/hire-gnome-backup.log 2>&1
```

## 3) Restore

Restore from a SQL dump:
```bash
npm run db:restore -- --input .backups/ats-backup-YYYYMMDD-HHMMSS.sql --drop-first
```

Flags:
- `--input <file>` required.
- `--drop-first` optional; drops/recreates target DB before restore.

## 4) Health Monitoring

Run health check:
```bash
npm run health
```

Use a custom URL + one-off alert webhook:
```bash
npm run health -- http://localhost:3000/api/health --alert-webhook "https://example.com/webhook"
```

Env:
- `HEALTH_ALERT_WEBHOOK_URL`
- `HEALTH_ALERT_SOURCE` (default: `hire-gnome-ats`)

## 4.1) API Trace Headers

All API responses include:
- `x-request-id` (correlates request across proxy/API logs)
- `x-response-time-ms` (route execution timing)
- `server-timing: app;dur=<ms>`

Use these in reverse-proxy logs and incident debugging.

## 5) Error Alert Hooks

API errors are logged and can send webhook alerts from server runtime.

Env:
- `ERROR_ALERT_WEBHOOK_URL`
- `ERROR_ALERT_MIN_LEVEL` (default: `error`)
- `ERROR_ALERT_COOLDOWN_SECONDS` (default: `300`)
- `ERROR_ALERT_SOURCE` (default: `hire-gnome-ats`)

Recommended:
- Use an incident channel webhook (PagerDuty/Opsgenie/Slack middleware).
- Keep cooldown at 2-5 minutes to avoid noise bursts.

## 5.1) Papertrail Shipping

Application logs are always written to process stdout/stderr in structured JSON.
Papertrail forwarding is optional and uses UDP syslog when configured.

Enable by setting:
- `PAPERTRAIL_HOST`
- `PAPERTRAIL_PORT`

Optional:
- `PAPERTRAIL_MIN_LEVEL` (`debug|info|warn|error`, default `info`)
- `PAPERTRAIL_APP_NAME` (default `hire-gnome-ats`)
- `PAPERTRAIL_FACILITY` (`0-23`, default `16` / `local0`)

If `PAPERTRAIL_HOST` or `PAPERTRAIL_PORT` is missing, shipping is disabled and logs remain local to stdout/stderr only.

## 6) Build-Time DB Behavior

By default the app skips System Settings DB reads during `next build` to keep SSG stable without DB access.

Env:
- `SKIP_SYSTEM_SETTINGS_DB_DURING_BUILD`:
	- `true` (default): uses safe defaults during build.
	- `false`: allows DB reads during build if DB is reachable.

## 7) Career Site Anti-Abuse Guard

Career-site quick-apply submissions use layered controls:
- IP/network mutation throttle (`CAREERS_APPLY_* rate-limit envs`)
- honeypot field check
- minimum form fill timing guard (`CAREERS_APPLY_MIN_FORM_FILL_SECONDS`, default `2`)

Set `CAREERS_APPLY_MIN_FORM_FILL_SECONDS=0` to disable timing checks.
