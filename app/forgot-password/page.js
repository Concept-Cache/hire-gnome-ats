'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import FormField from '@/app/components/form-field';
import { useToast } from '@/app/components/toast-provider';
import useSystemBranding from '@/app/hooks/use-system-branding';

export default function ForgotPasswordPage() {
	const toast = useToast();
	const branding = useSystemBranding();
	const [form, setForm] = useState({
		email: ''
	});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		setError('');
	}, [form.email]);

	async function onSubmit(event) {
		event.preventDefault();
		if (!form.email.trim()) {
			const message = 'Email is required.';
			setError(message);
			toast.error(message);
			return;
		}

		setSaving(true);
		setError('');

		const res = await fetch('/api/session/forgot-password', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email: form.email
			})
		});

		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			const message =
				data?.errors?.fieldErrors?.email?.[0] ||
				data?.error ||
				'Failed to submit request. Try again.';
			setError(message);
			toast.error(message);
			setSaving(false);
			return;
		}

		const message =
			data?.message ||
			'If an active user exists for that email, we sent a password reset link.';
		toast.success(message);
		setSaving(false);
	}

	return (
		<section className="auth-page">
			<article className="auth-card">
				<Link
					href="/"
					className={branding.hasCustomLogo ? 'auth-brand-link' : 'auth-brand-link brand-plaque'}
					aria-label={`${branding.siteName} home`}
				>
					<img src={branding.logoUrl} alt={branding.siteName} className="auth-brand-logo" />
				</Link>
				<h1>Forgot Password</h1>
				<p className="auth-subtitle">Enter your user email and we will send a reset link.</p>
				<form onSubmit={onSubmit} className="auth-form">
					<FormField label="Email" required>
						<input
							type="email"
							autoComplete="email"
							value={form.email}
							onChange={(event) => setForm({ email: event.target.value })}
							required
						/>
					</FormField>
					{error ? <p className="panel-subtext error">{error}</p> : null}
					<button type="submit" disabled={saving}>
						{saving ? 'Sending...' : 'Send Reset Link'}
					</button>
				</form>
				<div className="auth-links">
					<Link href="/login" className="auth-link">
						Back to sign in
					</Link>
				</div>
			</article>
		</section>
	);
}
