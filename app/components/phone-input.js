'use client';

import { formatPhoneInput } from '@/lib/phone';

export default function PhoneInput({ value, onChange, ...props }) {
	return (
		<input
			{...props}
			type="tel"
			inputMode="numeric"
			autoComplete="tel"
			value={value || ''}
			onChange={(e) => onChange(formatPhoneInput(e.target.value))}
		/>
	);
}
