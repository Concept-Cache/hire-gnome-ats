'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import FormField from '@/app/components/form-field';
import { useToast } from '@/app/components/toast-provider';
import useSystemBranding from '@/app/hooks/use-system-branding';

function ResetPasswordPageContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const toast = useToast();
	const branding = useSystemBranding();
	const token = useMemo(() => String(searchParams.get('token') || '').trim(), [searchParams]);
	const [form, setForm] = useState({
		password: '',
		confirmPassword: ''
	});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		setError('');
	}, [form.password, form.confirmPassword]);

	async function onSubmit(event) {
		event.preventDefault();
		if (!token) {
			const message = 'Reset link is missing a token. Request a new link.';
			setError(message);
			toast.error(message);
			return;
		}
		if (!form.password.trim() || !form.confirmPassword.trim()) {
			const message = 'Password and confirm password are required.';
			setError(message);
			toast.error(message);
			return;
		}
		if (form.password !== form.confirmPassword) {
			const message = 'Passwords do not match.';
			setError(message);
			toast.error(message);
			return;
		}

		setSaving(true);
		setError('');

		const res = await fetch('/api/session/reset-password', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				token,
				password: form.password,
				confirmPassword: form.confirmPassword
			})
		});

		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			const message =
				data?.errors?.fieldErrors?.password?.[0] ||
				data?.errors?.fieldErrors?.confirmPassword?.[0] ||
				data?.error ||
				'Failed to reset password. Request a new link and try again.';
			setError(message);
			toast.error(message);
			setSaving(false);
			return;
		}

		const message =
			data?.message ||
			'Password reset successful. You can now sign in with your new password.';
		toast.success(message);
		setSaving(false);
		setTimeout(() => {
			router.replace('/login');
		}, 1000);
	}

	return (
		<section className="auth-page">
			<article className="auth-card">
				<Link href="/" className="auth-brand-link" aria-label={`${branding.siteName} home`}>
					<img src={branding.logoUrl} alt={branding.siteName} className="auth-brand-logo" />
				</Link>
				<h1>Reset Password</h1>
				<p className="auth-subtitle">Set your new password for your {branding.siteName} account.</p>
				<form onSubmit={onSubmit} className="auth-form auth-form-reset">
					<FormField label="New Password" required hint="Minimum 8 characters">
						<input
							type="password"
							autoComplete="new-password"
							value={form.password}
							onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
							required
						/>
					</FormField>
					<FormField label="Confirm New Password" required>
						<input
							type="password"
							autoComplete="new-password"
							value={form.confirmPassword}
							onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
							required
						/>
					</FormField>
					{error ? <p className="panel-subtext error">{error}</p> : null}
					<div className="auth-reset-actions">
						<button type="submit" disabled={saving || !token}>
							{saving ? 'Resetting...' : 'Reset Password'}
						</button>
					</div>
				</form>
				<div className="auth-links auth-links-reset">
					<Link href="/forgot-password" className="auth-link">
						Request another reset link
					</Link>
					<Link href="/login" className="auth-link">
						Back to sign in
					</Link>
				</div>
			</article>
		</section>
	);
}

export default function ResetPasswordPage() {
	return (
		<Suspense
			fallback={
				<section className="auth-page">
					<article className="auth-card">
						<p className="auth-subtitle">Loading reset password...</p>
					</article>
				</section>
			}
		>
			<ResetPasswordPageContent />
		</Suspense>
	);
}
