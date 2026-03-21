'use client';

import { LoaderCircle, Save } from 'lucide-react';

export default function SaveActionButton({
	type = 'submit',
	saving = false,
	disabled = false,
	label = 'Save',
	savingLabel = 'Saving...',
	icon: Icon = Save,
	className = '',
	...props
}) {
	const nextClassName = ['btn-save-action', className].filter(Boolean).join(' ');

	return (
		<button type={type} className={nextClassName} disabled={disabled} {...props}>
			{saving ? (
				<LoaderCircle aria-hidden="true" className="btn-refresh-icon-svg row-action-icon-spinner" />
			) : (
				<Icon aria-hidden="true" className="btn-refresh-icon-svg" />
			)}
			<span>{saving ? savingLabel : label}</span>
		</button>
	);
}
