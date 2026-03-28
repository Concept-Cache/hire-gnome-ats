'use client';

export default function FormField({ label, required = false, children, hint = '', className = '' }) {
	return (
		<div className={`form-field ${className}`.trim()}>
			<div className="form-label-row">
				<label className="form-label">
					{label}
					{required ? <span className="form-required"> *</span> : null}
				</label>
				{hint ? <span className="form-label-hint">{hint}</span> : null}
			</div>
			{children}
		</div>
	);
}
