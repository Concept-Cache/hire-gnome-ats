export const USER_ROLES = ['ADMINISTRATOR', 'DIRECTOR', 'RECRUITER'];

export const DIVISION_ACCESS_MODES = ['COLLABORATIVE', 'OWNER_ONLY'];

export const USER_ROLE_LABELS = {
	ADMINISTRATOR: 'Administrator',
	DIRECTOR: 'Director',
	RECRUITER: 'Recruiter'
};

export const DIVISION_ACCESS_MODE_LABELS = {
	COLLABORATIVE: 'Collaborative',
	OWNER_ONLY: 'Owner Only'
};

function parsePositiveIntEnv(name, fallback) {
	const raw = String(process.env[name] || '').trim();
	if (!raw) return fallback;
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return fallback;
	}
	return parsed;
}

function parseNonNegativeIntEnv(name, fallback) {
	const raw = String(process.env[name] || '').trim();
	if (!raw) return fallback;
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed < 0) {
		return fallback;
	}
	return parsed;
}

export const ACTING_USER_COOKIE_NAME = 'ats-acting-user-id';
export const AUTH_SESSION_COOKIE_NAME = 'ats-session';
export const AUTH_SESSION_MAX_AGE_SECONDS = parsePositiveIntEnv('AUTH_SESSION_MAX_AGE_SECONDS', 60 * 60 * 12);
export const AUTH_LOGIN_MAX_ATTEMPTS = parsePositiveIntEnv('AUTH_LOGIN_MAX_ATTEMPTS', 5);
export const AUTH_LOGIN_LOCKOUT_MINUTES = parsePositiveIntEnv('AUTH_LOGIN_LOCKOUT_MINUTES', 15);
export const AUTH_LOGIN_RATE_LIMIT_MAX_REQUESTS = parsePositiveIntEnv('AUTH_LOGIN_RATE_LIMIT_MAX_REQUESTS', 20);
export const AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS = parsePositiveIntEnv(
	'AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS',
	60 * 15
);
export const AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX_REQUESTS = parsePositiveIntEnv(
	'AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX_REQUESTS',
	6
);
export const AUTH_FORGOT_PASSWORD_RATE_LIMIT_WINDOW_SECONDS = parsePositiveIntEnv(
	'AUTH_FORGOT_PASSWORD_RATE_LIMIT_WINDOW_SECONDS',
	60 * 15
);
export const AUTH_RESET_PASSWORD_RATE_LIMIT_MAX_REQUESTS = parsePositiveIntEnv(
	'AUTH_RESET_PASSWORD_RATE_LIMIT_MAX_REQUESTS',
	10
);
export const AUTH_RESET_PASSWORD_RATE_LIMIT_WINDOW_SECONDS = parsePositiveIntEnv(
	'AUTH_RESET_PASSWORD_RATE_LIMIT_WINDOW_SECONDS',
	60 * 15
);
export const CAREERS_APPLY_RATE_LIMIT_MAX_REQUESTS = parsePositiveIntEnv('CAREERS_APPLY_RATE_LIMIT_MAX_REQUESTS', 6);
export const CAREERS_APPLY_RATE_LIMIT_WINDOW_SECONDS = parsePositiveIntEnv(
	'CAREERS_APPLY_RATE_LIMIT_WINDOW_SECONDS',
	60 * 15
);
export const CAREERS_APPLY_MIN_FORM_FILL_SECONDS = parseNonNegativeIntEnv(
	'CAREERS_APPLY_MIN_FORM_FILL_SECONDS',
	2
);

export const LOOKUP_RATE_LIMIT_MAX_REQUESTS = parsePositiveIntEnv('LOOKUP_RATE_LIMIT_MAX_REQUESTS', 80);
export const LOOKUP_RATE_LIMIT_WINDOW_SECONDS = parsePositiveIntEnv('LOOKUP_RATE_LIMIT_WINDOW_SECONDS', 60);
export const GLOBAL_SEARCH_RATE_LIMIT_MAX_REQUESTS = parsePositiveIntEnv('GLOBAL_SEARCH_RATE_LIMIT_MAX_REQUESTS', 30);
export const GLOBAL_SEARCH_RATE_LIMIT_WINDOW_SECONDS = parsePositiveIntEnv('GLOBAL_SEARCH_RATE_LIMIT_WINDOW_SECONDS', 60);
export const MUTATION_RATE_LIMIT_MAX_REQUESTS = parsePositiveIntEnv('MUTATION_RATE_LIMIT_MAX_REQUESTS', 120);
export const MUTATION_RATE_LIMIT_WINDOW_SECONDS = parsePositiveIntEnv('MUTATION_RATE_LIMIT_WINDOW_SECONDS', 60);
export const CANDIDATE_MATCH_RATE_LIMIT_MAX_REQUESTS = parsePositiveIntEnv('CANDIDATE_MATCH_RATE_LIMIT_MAX_REQUESTS', 20);
export const CANDIDATE_MATCH_RATE_LIMIT_WINDOW_SECONDS = parsePositiveIntEnv('CANDIDATE_MATCH_RATE_LIMIT_WINDOW_SECONDS', 60);
export const JOB_ORDER_MATCH_RATE_LIMIT_MAX_REQUESTS = parsePositiveIntEnv('JOB_ORDER_MATCH_RATE_LIMIT_MAX_REQUESTS', 20);
export const JOB_ORDER_MATCH_RATE_LIMIT_WINDOW_SECONDS = parsePositiveIntEnv('JOB_ORDER_MATCH_RATE_LIMIT_WINDOW_SECONDS', 60);
export const RESUME_PARSE_RATE_LIMIT_MAX_REQUESTS = parsePositiveIntEnv('RESUME_PARSE_RATE_LIMIT_MAX_REQUESTS', 30);
export const RESUME_PARSE_RATE_LIMIT_WINDOW_SECONDS = parsePositiveIntEnv(
	'RESUME_PARSE_RATE_LIMIT_WINDOW_SECONDS',
	60 * 10
);
export const REQUEST_THROTTLE_GLOBAL_CLEANUP_SECONDS = parsePositiveIntEnv(
	'REQUEST_THROTTLE_GLOBAL_CLEANUP_SECONDS',
	60 * 60
);
export const REQUEST_THROTTLE_GLOBAL_CLEANUP_INTERVAL_SECONDS = parsePositiveIntEnv(
	'REQUEST_THROTTLE_GLOBAL_CLEANUP_INTERVAL_SECONDS',
	60 * 5
);
