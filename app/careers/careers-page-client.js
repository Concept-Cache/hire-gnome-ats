'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BriefcaseBusiness, Building2, ChevronLeft, ChevronRight, MapPin, Search } from 'lucide-react';

const PAGE_SIZE_STORAGE_KEY = 'hg-list-page-size';
const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function formatCurrencyRange(min, max, currency = 'USD') {
	const hasMin = Number.isFinite(Number(min));
	const hasMax = Number.isFinite(Number(max));
	if (!hasMin && !hasMax) return 'Compensation discussed during interview.';

	const formatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: currency === 'CAD' ? 'CAD' : 'USD',
		maximumFractionDigits: 0
	});

	if (hasMin && hasMax) {
		return `${formatter.format(Number(min))} - ${formatter.format(Number(max))}`;
	}
	if (hasMin) return `${formatter.format(Number(min))}+`;
	return `Up to ${formatter.format(Number(max))}`;
}

function formatDate(value) {
	if (!value) return 'Recently posted';
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return 'Recently posted';
	return parsed.toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

function normalizeQuickPreset(value) {
	const normalized = String(value || '').trim().toLowerCase();
	if (
		normalized === 'remote' ||
		normalized === 'hybrid' ||
		normalized === 'onsite' ||
		normalized === 'tech' ||
		normalized === 'healthcare' ||
		normalized === 'temp' ||
		normalized === 'contract' ||
		normalized === 'permanent' ||
		normalized === 'new_week'
	) {
		return normalized;
	}
	return '';
}

function matchesQuickPreset(job, quickPreset) {
	if (!quickPreset) return true;

	const locationText = String(job?.location || '').toLowerCase();
	const titleText = String(job?.title || '').toLowerCase();
	const teaserText = String(job?.teaser || '').toLowerCase();
	const employmentTypeText = String(job?.employmentType || '').toLowerCase();
	const industryText = String(job?.client?.industry || '').toLowerCase();
	const publishedAtValue = job?.publishedAt || job?.openedAt;
	const postedAt = publishedAtValue ? new Date(publishedAtValue) : null;
	const hasValidPostedAt = postedAt && !Number.isNaN(postedAt.getTime());

	const includesAny = (value, terms) => terms.some((term) => value.includes(term));
	const remoteTerms = ['remote'];
	const hybridTerms = ['hybrid'];
	const onSiteTerms = ['on-site', 'on site', 'onsite', 'in person'];
	const tempTerms = ['temp', 'temporary', 'w2', '1099'];
	const contractTerms = ['contract', 'consultant', 'freelance', '1099'];
	const permanentTerms = ['perm', 'permanent', 'full-time', 'full time'];
	const techTerms = [
		'engineer',
		'developer',
		'software',
		'data',
		'architect',
		'cyber',
		'it ',
		'technology',
		'technical'
	];
	const healthcareTerms = [
		'health',
		'clinical',
		'medical',
		'nurse',
		'hospital',
		'provider',
		'pharma',
		'biotech'
	];
	const combinedText = `${titleText} ${teaserText} ${industryText}`;

	if (quickPreset === 'remote') {
		return includesAny(`${locationText} ${titleText} ${teaserText}`, remoteTerms);
	}

	if (quickPreset === 'hybrid') {
		return includesAny(`${locationText} ${titleText} ${teaserText}`, hybridTerms);
	}

	if (quickPreset === 'onsite') {
		return includesAny(`${locationText} ${titleText} ${teaserText}`, onSiteTerms);
	}

	if (quickPreset === 'temp') {
		return includesAny(`${employmentTypeText} ${titleText} ${teaserText}`, tempTerms);
	}

	if (quickPreset === 'contract') {
		return includesAny(`${employmentTypeText} ${titleText} ${teaserText}`, contractTerms);
	}

	if (quickPreset === 'permanent') {
		return includesAny(`${employmentTypeText} ${titleText} ${teaserText}`, permanentTerms);
	}

	if (quickPreset === 'tech') {
		return includesAny(combinedText, techTerms);
	}

	if (quickPreset === 'healthcare') {
		return includesAny(combinedText, healthcareTerms);
	}

	if (quickPreset === 'new_week') {
		if (!hasValidPostedAt) return false;
		const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
		return postedAt.getTime() >= sevenDaysAgo;
	}

	return true;
}

export default function CareersPageClient({ siteName = 'Hire Gnome ATS', initialJobs = [] }) {
	const searchParams = useSearchParams();
	const quickPreset = normalizeQuickPreset(searchParams.get('quick'));
	const jobs = Array.isArray(initialJobs) ? initialJobs : [];
	const [query, setQuery] = useState('');
	const [locationFilter, setLocationFilter] = useState('all');
	const [employmentTypeFilter, setEmploymentTypeFilter] = useState('all');
	const [currentPage, setCurrentPage] = useState(1);
	const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

	const locationOptions = useMemo(
		() => [...new Set(jobs.map((job) => job.location).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
		[jobs]
	);
	const employmentTypeOptions = useMemo(
		() => [...new Set(jobs.map((job) => job.employmentType).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
		[jobs]
	);

	const filteredJobs = useMemo(() => {
		const q = query.trim().toLowerCase();
		return jobs.filter((job) => {
			const matchesQuery =
				!q ||
				`${job.title} ${job.client?.name || ''} ${job.location || ''} ${job.employmentType || ''} ${job.teaser || ''}`
					.toLowerCase()
					.includes(q);
			const matchesLocation = locationFilter === 'all' || job.location === locationFilter;
			const matchesEmploymentType =
				employmentTypeFilter === 'all' || job.employmentType === employmentTypeFilter;
			const matchesQuick = matchesQuickPreset(job, quickPreset);
			return matchesQuery && matchesLocation && matchesEmploymentType && matchesQuick;
		});
	}, [jobs, query, locationFilter, employmentTypeFilter, quickPreset]);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const stored = Number(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
		if (PAGE_SIZE_OPTIONS.includes(stored)) {
			setPageSize(stored);
		}
	}, []);

	useEffect(() => {
		setCurrentPage(1);
	}, [query, locationFilter, employmentTypeFilter, quickPreset]);

	const totalRows = filteredJobs.length;
	const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

	useEffect(() => {
		setCurrentPage((current) => {
			if (current < 1) return 1;
			if (current > totalPages) return totalPages;
			return current;
		});
	}, [totalPages]);

	const startIndex = totalRows === 0 ? 0 : (currentPage - 1) * pageSize;
	const endIndex = totalRows === 0 ? 0 : Math.min(startIndex + pageSize, totalRows);
	const visibleJobs = filteredJobs.slice(startIndex, endIndex);

	function onPageSizeChange(event) {
		const nextSize = Number(event.target.value);
		if (!PAGE_SIZE_OPTIONS.includes(nextSize)) return;
		setPageSize(nextSize);
		setCurrentPage(1);
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(nextSize));
		}
	}

	function onPreviousPage() {
		setCurrentPage((current) => Math.max(1, current - 1));
	}

	function onNextPage() {
		setCurrentPage((current) => Math.min(totalPages, current + 1));
	}

	return (
		<section className="careers-page">
			<header className="careers-hero">
				<div className="careers-hero-copy">
					<p className="careers-eyebrow">{siteName} Careers</p>
					<h1>Find your next placement opportunity.</h1>
					<p>
						Explore active roles across healthcare, technology, and professional services. Apply directly
						through the listing in under two minutes.
					</p>
				</div>
				<div className="careers-hero-stats">
					<p>
						<span>Open Roles</span>
						<strong>{jobs.length}</strong>
					</p>
					<p>
						<span>Client Partners</span>
						<strong>{new Set(jobs.map((job) => job.client?.name).filter(Boolean)).size}</strong>
					</p>
				</div>
			</header>

			<article className="careers-panel">
				<div className="careers-filters">
					<label className="careers-filter-search">
						<span aria-hidden="true">
							<Search />
						</span>
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search role, company, location, keyword"
							aria-label="Search openings"
						/>
					</label>
					<select
						value={locationFilter}
						onChange={(event) => setLocationFilter(event.target.value)}
						aria-label="Filter by location"
					>
						<option value="all">All locations</option>
						{locationOptions.map((location) => (
							<option key={location} value={location}>
								{location}
							</option>
						))}
					</select>
					<select
						value={employmentTypeFilter}
						onChange={(event) => setEmploymentTypeFilter(event.target.value)}
						aria-label="Filter by employment type"
					>
						<option value="all">All employment types</option>
						{employmentTypeOptions.map((employmentType) => (
							<option key={employmentType} value={employmentType}>
								{employmentType}
							</option>
						))}
					</select>
				</div>

				{filteredJobs.length === 0 ? (
					<p className="careers-empty">No roles match your current filters.</p>
				) : null}

				{visibleJobs.length > 0 ? (
					<ul className="careers-job-list">
						{visibleJobs.map((job) => (
							<li key={job.id} className="careers-job-card">
								<div className="careers-job-head">
									<div>
										<h2>{job.title}</h2>
										<p className="careers-job-company">
											<Building2 aria-hidden="true" />
											<span>{job.client?.name || 'Confidential Client'}</span>
										</p>
									</div>
									<p className="careers-job-posted">Posted {formatDate(job.publishedAt || job.openedAt)}</p>
								</div>

								<div className="careers-job-meta">
									<p>
										<MapPin aria-hidden="true" />
										<span>{job.location || 'Location flexible'}</span>
									</p>
									<p>
										<BriefcaseBusiness aria-hidden="true" />
										<span>{job.employmentType || 'Role type to be discussed'}</span>
									</p>
								</div>

								<p className="careers-job-teaser">{job.teaser || 'View details to review full responsibilities.'}</p>
								<p className="careers-job-pay">{formatCurrencyRange(job.salaryMin, job.salaryMax, job.currency)}</p>
								<Link href={`/careers/jobs/${job.id}`} className="careers-job-cta">
									View Details & Apply
								</Link>
							</li>
						))}
					</ul>
				) : null}

				{filteredJobs.length > 0 ? (
					<div className="table-pagination careers-pagination">
						<div className="table-pagination-size">
							<label htmlFor="careers-page-size">Page Size</label>
							<select id="careers-page-size" value={pageSize} onChange={onPageSizeChange}>
								{PAGE_SIZE_OPTIONS.map((option) => (
									<option key={option} value={option}>
										{option}
									</option>
								))}
							</select>
						</div>
						<div className="table-pagination-nav">
							<span className="table-pagination-range">
								{totalRows === 0 ? '0-0 of 0' : `${startIndex + 1}-${endIndex} of ${totalRows}`}
							</span>
							<button
								type="button"
								className="table-pagination-button"
								onClick={onPreviousPage}
								disabled={currentPage <= 1}
								aria-label="Previous page"
								title="Previous page"
							>
								<ChevronLeft aria-hidden="true" />
							</button>
							<span className="table-pagination-page">
								Page {totalRows === 0 ? 0 : currentPage} of {totalRows === 0 ? 0 : totalPages}
							</span>
							<button
								type="button"
								className="table-pagination-button"
								onClick={onNextPage}
								disabled={currentPage >= totalPages || totalRows === 0}
								aria-label="Next page"
								title="Next page"
							>
								<ChevronRight aria-hidden="true" />
							</button>
						</div>
					</div>
				) : null}
			</article>
		</section>
	);
}
