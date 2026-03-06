# Security Policy

## Supported Versions
This project is currently pre-1.0. Security updates are applied to the latest mainline only.

## Reporting a Vulnerability
Please do not open public issues for security reports.

Send details privately to the maintainers with:
- Impact summary
- Steps to reproduce
- Affected endpoints/components
- Suggested remediation (if available)

Include logs, request IDs, and environment details when possible.

## Hardening Notes
- Keep `AUTH_SESSION_SECRET` long and unique per environment.
- Use HTTPS in production for `AUTH_APP_BASE_URL`.
- Set `EMAIL_TEST_MODE=false` only when production email routing is verified.
- Rotate external integration keys regularly.
- Keep object storage buckets private; downloads should remain app-mediated.
