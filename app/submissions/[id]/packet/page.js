'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowUpRight, BriefcaseBusiness, Download, Printer, UserRound } from 'lucide-react';
import LoadingIndicator from '@/app/components/loading-indicator';
import { formatDateTimeAt } from '@/lib/date-format';
import { submissionCreatedByLabel, submissionOriginLabel } from '@/lib/submission-origin';
import { getEffectiveSubmissionStatus } from '@/lib/submission-status';

function formatSubmissionStatusLabel(value) {
	const normalized = String(value || '').trim().toLowerCase();
	if (normalized === 'under_review') return 'Under Review';
	if (normalized === 'submitted') return 'Submitted';
	if (normalized === 'qualified') return 'Qualified';
	if (normalized === 'rejected') return 'Rejected';
	if (normalized === 'offered') return 'Offered';
	if (normalized === 'hired') return 'Hired';
	if (normalized === 'placed') return 'Placed';
	return normalized ? normalized.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase()) : '-';
}

function formatInterviewStatusLabel(value) {
	const normalized = String(value || '').trim().toLowerCase();
	if (normalized === 'scheduled') return 'Scheduled';
	if (normalized === 'completed') return 'Completed';
	if (normalized === 'cancelled') return 'Cancelled';
	if (normalized === 'rescheduled') return 'Rescheduled';
	return normalized ? normalized.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase()) : '-';
}

function personLabel(person) {
	if (!person) return 'Unknown User';
	return `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Unknown User';
}

function listSkillNames(candidate) {
	if (!Array.isArray(candidate?.candidateSkills)) return [];
	return candidate.candidateSkills.map((candidateSkill) => candidateSkill?.skill?.name).filter(Boolean);
}

function formatWorkDateRange(work) {
	const start = work?.startDate ? formatDateTimeAt(work.startDate).split(' @ ')[0] : '';
	const end = work?.endDate ? formatDateTimeAt(work.endDate).split(' @ ')[0] : 'Present';
	if (!start && !end) return '';
	return [start, end].filter(Boolean).join(' - ');
}

export default function SubmissionPacketPage() {
	const { id } = useParams();
	const [state, setState] = useState({
		loading: true,
		error: '',
		payload: null
	});

	useEffect(() => {
		if (typeof document !== 'undefined') {
			document.body.classList.add('submission-packet-print-mode');
		}

		let cancelled = false;
		fetch(`/api/submissions/${id}/packet`, { cache: 'no-store' })
			.then((response) => response.json().then((data) => ({ ok: response.ok, data })))
			.then(({ ok, data }) => {
				if (cancelled) return;
				if (!ok) {
					setState({
						loading: false,
						error: data.error || 'Failed to load submission packet.',
						payload: null
					});
					return;
				}
				setState({
					loading: false,
					error: '',
					payload: data
				});
			})
			.catch(() => {
				if (cancelled) return;
				setState({
					loading: false,
					error: 'Failed to load submission packet.',
					payload: null
				});
			});

		return () => {
			cancelled = true;
			if (typeof document !== 'undefined') {
				document.body.classList.remove('submission-packet-print-mode');
			}
		};
	}, [id]);

	const submission = state.payload?.submission || null;
	const candidate = submission?.candidate || null;
	const jobOrder = submission?.jobOrder || null;
	const matchExplanation = state.payload?.matchExplanation || null;
	const interviews = Array.isArray(state.payload?.interviews) ? state.payload.interviews : [];
	const resumeAttachment = candidate?.attachments?.[0] || null;
	const latestQuestionSetInterview = useMemo(
		() => interviews.find((interview) => String(interview?.aiQuestionSet || '').trim()),
		[interviews]
	);
	const skillNames = useMemo(() => listSkillNames(candidate), [candidate]);

	function onPrintPacket() {
		window.print();
	}

	if (state.loading) {
		return (
			<section className="module-page submission-packet-page">
				<LoadingIndicator className="page-loading-indicator" label="Loading submission packet" />
			</section>
		);
	}

	if (state.error || !submission) {
		return (
			<section className="module-page submission-packet-page">
				<article className="panel panel-spacious">
					<h2>Submission Packet</h2>
					<p>{state.error || 'Submission packet unavailable.'}</p>
					<div className="submission-packet-toolbar">
						<Link href={`/submissions/${id}`} className="btn-secondary">Back To Submission</Link>
					</div>
				</article>
			</section>
		);
	}

	return (
		<section className="module-page submission-packet-page">
			<header className="module-header submission-packet-header">
				<div>
					<Link href={`/submissions/${id}`} className="module-back-link" aria-label="Back to Submission">&larr; Back</Link>
					<h2>Submission Packet</h2>
					<p>
						{submission.recordId || `Submission #${submission.id}`} | {candidate?.firstName || '-'} {candidate?.lastName || ''} | {jobOrder?.title || '-'}
					</p>
				</div>
				<div className="module-header-actions submission-packet-toolbar">
					<Link href={`/candidates/${submission.candidateId}`} className="btn-secondary btn-link-icon" title="Open Candidate" aria-label="Open Candidate">
						<UserRound aria-hidden="true" className="btn-refresh-icon-svg" />
					</Link>
					<Link href={`/job-orders/${submission.jobOrderId}`} className="btn-secondary btn-link-icon" title="Open Job Order" aria-label="Open Job Order">
						<BriefcaseBusiness aria-hidden="true" className="btn-refresh-icon-svg" />
					</Link>
					<button type="button" className="btn-secondary submission-packet-button" onClick={onPrintPacket}>
						<Printer aria-hidden="true" className="btn-refresh-icon-svg" /> Print / Save PDF
					</button>
				</div>
			</header>

			<article className="panel submission-packet-cover">
				<div className="submission-packet-cover-head">
					<div>
						<p className="submission-packet-kicker">Client Submission Packet</p>
						<h3>{candidate?.firstName || '-'} {candidate?.lastName || ''}</h3>
						<p className="panel-subtext">{candidate?.currentJobTitle || '-'}{candidate?.currentEmployer ? ` | ${candidate.currentEmployer}` : ''}</p>
					</div>
					<div className="submission-packet-statuses">
						<span className="chip">{formatSubmissionStatusLabel(getEffectiveSubmissionStatus(submission))}</span>
						<span className="chip">{submissionOriginLabel(submission)}</span>
					</div>
				</div>
				<div className="info-list submission-packet-cover-grid">
					<p><span>Job Order</span><strong>{jobOrder?.title || '-'}</strong></p>
					<p><span>Client</span><strong>{jobOrder?.client?.name || '-'}</strong></p>
					<p><span>Hiring Manager</span><strong>{jobOrder?.contact ? `${jobOrder.contact.firstName || ''} ${jobOrder.contact.lastName || ''}`.trim() || '-' : '-'}</strong></p>
					<p><span>Location</span><strong>{candidate?.city || candidate?.state ? [candidate?.city, candidate?.state].filter(Boolean).join(', ') : jobOrder?.location || '-'}</strong></p>
					<p><span>Submitted By</span><strong>{submissionCreatedByLabel(submission)}</strong></p>
					<p><span>Submitted</span><strong>{formatDateTimeAt(submission.createdAt)}</strong></p>
				</div>
			</article>

			<div className="submission-packet-grid">
				<article className="panel panel-spacious">
					<h3>Recruiter Write-Up</h3>
					{String(submission.aiWriteUp || '').trim() ? (
						<div className="submission-packet-prose">
							{String(submission.aiWriteUp)
								.split(/\n{2,}/)
								.map((paragraph) => paragraph.trim())
								.filter(Boolean)
								.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
						</div>
					) : (
						<div className="submission-packet-empty-state">
							<p className="panel-subtext">No recruiter write-up has been prepared for this submission yet.</p>
						</div>
					)}
					{submission.aiWriteUpGeneratedAt ? (
						<p className="simple-list-meta submission-ai-meta">
							Generated by {personLabel(submission.aiWriteUpGeneratedByUser)} @ <span className="meta-emphasis-time">{formatDateTimeAt(submission.aiWriteUpGeneratedAt)}</span>
						</p>
					) : null}
				</article>

				<article className="panel panel-spacious">
					<h3>Resume</h3>
					{resumeAttachment ? (
						<div className="submission-packet-file-card">
							<div>
								<strong>{resumeAttachment.fileName || 'Primary Resume'}</strong>
								<p className="panel-subtext">Primary resume on the candidate record.</p>
							</div>
							<a href={`/api/candidates/${submission.candidateId}/files/${resumeAttachment.id}/download`} className="btn-secondary submission-packet-button">
								<Download aria-hidden="true" className="btn-refresh-icon-svg" /> Download
							</a>
						</div>
					) : (
						<p className="panel-subtext">No primary resume is labeled on this candidate.</p>
					)}
				</article>
			</div>

			<article className="panel panel-spacious">
				<div className="submission-packet-grid">
					<div>
						<h4>Candidate Summary</h4>
						<p className="submission-packet-text">{candidate?.summary || candidate?.skillSet || 'No summary available.'}</p>
					</div>
					<div>
						<h4>Skills</h4>
						{skillNames.length > 0 ? (
							<div className="submission-packet-chip-list">
								{skillNames.map((skillName) => <span key={skillName} className="chip">{skillName}</span>)}
							</div>
						) : (
							<p className="panel-subtext">No structured skills recorded.</p>
						)}
					</div>
				</div>
				<div className="submission-packet-work-list">
					<h4>Recent Work History</h4>
					{Array.isArray(candidate?.candidateWorkExperiences) && candidate.candidateWorkExperiences.length > 0 ? (
						<ul className="simple-list">
							{candidate.candidateWorkExperiences.slice(0, 4).map((work) => (
								<li key={work.id}>
									<div>
										<strong>{work.title || '-'}{work.companyName ? ` | ${work.companyName}` : ''}</strong>
										{formatWorkDateRange(work) ? <p>{formatWorkDateRange(work)}</p> : null}
										{work.description ? <p>{work.description}</p> : null}
									</div>
								</li>
							))}
						</ul>
					) : (
						<p className="panel-subtext">No work history recorded.</p>
					)}
				</div>
			</article>

			<article className="panel panel-spacious">
				<h3>Match Explanation</h3>
				{matchExplanation ? (
					<div className="submission-packet-grid submission-packet-grid-tight">
						<div>
							<h4>Why It Matches</h4>
							<p className="submission-packet-text">{matchExplanation.whyItMatches || '-'}</p>
						</div>
						<div>
							<h4>Potential Gaps</h4>
							<p className="submission-packet-text">{matchExplanation.potentialGaps || '-'}</p>
						</div>
						<div>
							<h4>What To Validate</h4>
							<p className="submission-packet-text">{matchExplanation.whatToValidate || '-'}</p>
						</div>
						<div>
							<h4>Recommended Positioning</h4>
							<p className="submission-packet-text">{matchExplanation.recommendedPositioning || '-'}</p>
						</div>
						<p className="simple-list-meta submission-ai-meta submission-packet-span-all">
							Generated by {personLabel(matchExplanation.generatedByUser)} @ <span className="meta-emphasis-time">{formatDateTimeAt(matchExplanation.updatedAt || matchExplanation.createdAt)}</span>
						</p>
					</div>
				) : (
					<div className="submission-packet-empty-state">
						<p className="panel-subtext">No match explanation has been generated for this candidate and job order yet.</p>
					</div>
				)}
			</article>

			<article className="panel panel-spacious">
				<div className="submission-packet-grid">
					<div>
						<h4>Interview Activity</h4>
						{interviews.length > 0 ? (
							<ul className="simple-list">
								{interviews.map((interview) => (
									<li key={interview.id}>
										<div>
											<strong>{interview.subject || interview.recordId || 'Interview'}</strong>
											<p>{formatInterviewStatusLabel(interview.status)}{interview.startsAt ? ` | ${formatDateTimeAt(interview.startsAt)}` : ''}</p>
											{interview.interviewer ? <p>{interview.interviewer}</p> : null}
										</div>
									</li>
								))}
							</ul>
						) : (
							<p className="panel-subtext">No interviews are linked to this candidate and job order yet.</p>
						)}
					</div>
					<div>
						<h4>Interview Questions</h4>
						{latestQuestionSetInterview?.aiQuestionSet ? (
							<div className="submission-packet-prose submission-packet-text-block">
								{String(latestQuestionSetInterview.aiQuestionSet).split('\n').map((line, index) => (
									<p key={index}>{line || '\u00A0'}</p>
								))}
								<p className="simple-list-meta submission-ai-meta">
									Generated by {personLabel(latestQuestionSetInterview.aiQuestionSetGeneratedByUser)} @ <span className="meta-emphasis-time">{formatDateTimeAt(latestQuestionSetInterview.aiQuestionSetGeneratedAt)}</span>
								</p>
							</div>
						) : (
							<p className="panel-subtext">No AI interview question set has been generated yet.</p>
						)}
					</div>
				</div>
			</article>

			<article className="panel panel-spacious submission-packet-footer">
				<p className="simple-list-meta submission-ai-meta">
					Prepared on <span className="meta-emphasis-time">{formatDateTimeAt(new Date())}</span> from <Link href={`/submissions/${id}`}>submission detail <ArrowUpRight aria-hidden="true" className="snapshot-link-icon" /></Link>
				</p>
			</article>
		</section>
	);
}
