import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUpRight, FileText } from 'lucide-react';
import { getModuleHelpBySlug } from '@/lib/module-help-docs';

export default async function ModuleHelpPage({ params }) {
	const resolvedParams = await params;
	const doc = await getModuleHelpBySlug(resolvedParams?.module);
	if (!doc) {
		notFound();
	}

	return (
		<section className="module-page help-page">
			<header className="module-header module-header-list">
				<div>
					<Link href="/help" className="module-back-link" aria-label="Back to Help Index">
						&larr; Back
					</Link>
					<h2>{doc.title} Help</h2>
				</div>
				<div className="module-header-actions">
					<Link href={doc.moduleHref} className="btn-secondary help-open-module-btn" aria-label={`Open ${doc.title}`}>
						<FileText aria-hidden="true" className="btn-refresh-icon-svg" />
						<span>Open Module</span>
					</Link>
				</div>
			</header>

			<article className="panel panel-spacious markdown-doc-card">
				<ReactMarkdown
					remarkPlugins={[remarkGfm]}
					components={{
						a: ({ ...props }) => (
							<a {...props} target="_blank" rel="noreferrer">
								<span>{props.children}</span>
								<ArrowUpRight aria-hidden="true" className="inline-link-icon" />
							</a>
						)
					}}
				>
					{doc.markdown}
				</ReactMarkdown>
			</article>
		</section>
	);
}
