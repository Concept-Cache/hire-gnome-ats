import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { MODULE_HELP_DOCS } from '@/app/constants/module-help';

export default function HelpIndexPage() {
	return (
		<section className="module-page help-page">
			<header className="module-header module-header-list">
				<div>
					<Link href="/" className="module-back-link" aria-label="Back to Dashboard">
						&larr; Back
					</Link>
					<h2>Module Help</h2>
				</div>
			</header>

			<article className="panel panel-spacious markdown-doc-card">
				<p className="panel-subtext help-index-intro">
					Select a module help topic:
				</p>
				<ul className="help-index-list">
					{MODULE_HELP_DOCS.map((doc) => (
						<li key={doc.slug}>
							<Link href={`/help/${doc.slug}`} className="help-index-link">
								<span>{doc.title}</span>
								<ArrowUpRight aria-hidden="true" />
							</Link>
						</li>
					))}
				</ul>
			</article>
		</section>
	);
}
