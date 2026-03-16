'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, House, RotateCcw } from 'lucide-react';

function DefaultActionIcon({ kind }) {
	if (kind === 'retry') return <RotateCcw aria-hidden="true" className="btn-refresh-icon-svg" />;
	if (kind === 'back') return <ArrowLeft aria-hidden="true" className="btn-refresh-icon-svg" />;
	return <House aria-hidden="true" className="btn-refresh-icon-svg" />;
}

function ActionButton({ action }) {
	if (!action) return null;
	const {
		label,
		href,
		onClick,
		variant = 'primary',
		disabled = false,
		iconKind = 'home',
		type = 'button'
	} = action;
	const className = variant === 'secondary' ? 'btn-secondary' : undefined;
	const icon = <DefaultActionIcon kind={iconKind} />;

	if (href) {
		return (
			<Link href={href} className={variant === 'secondary' ? 'error-state-action-link btn-secondary' : 'error-state-action-link'}>
				{icon}
				<span>{label}</span>
			</Link>
		);
	}

	return (
		<button type={type} className={className} onClick={onClick} disabled={disabled}>
			{icon}
			<span>{label}</span>
		</button>
	);
}

export default function ErrorStatePage({
	statusCode,
	title,
	subtitle,
	description,
	imageSrc,
	imageAlt,
	primaryAction,
	secondaryAction
}) {
	return (
		<section className="error-state-shell">
			<div className="error-state-panel">
				<div className="error-state-copy">
					<span className="error-state-code">{statusCode}</span>
					<h1>{title}</h1>
					<p className="error-state-subtitle">{subtitle}</p>
					<p className="error-state-description">{description}</p>
					<div className="error-state-actions">
						<ActionButton action={primaryAction} />
						<ActionButton action={secondaryAction} />
					</div>
				</div>
				<div className="error-state-media">
					<div className="error-state-image-frame">
						<Image
							src={imageSrc}
							alt={imageAlt}
							width={1536}
							height={1024}
							priority
							className="error-state-image"
						/>
					</div>
				</div>
			</div>
		</section>
	);
}
