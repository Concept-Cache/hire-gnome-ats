'use client';

import { useEffect, useRef } from 'react';
import { Bold, Italic, Link2, List, ListOrdered, LoaderCircle, Underline } from 'lucide-react';
import { useConfirmDialog } from '@/app/components/confirm-dialog';

const toolbarItems = [
	{ command: 'bold', Icon: Bold, title: 'Bold' },
	{ command: 'italic', Icon: Italic, title: 'Italic' },
	{ command: 'underline', Icon: Underline, title: 'Underline' },
	{ command: 'insertUnorderedList', Icon: List, title: 'Bulleted List' },
	{ command: 'insertOrderedList', Icon: ListOrdered, title: 'Numbered List' }
];

export default function RichTextEditor({
	value,
	onChange,
	disabled = false,
	ariaLabel = 'Rich text editor',
	toolbarActions = []
}) {
	const editorRef = useRef(null);
	const { requestPrompt } = useConfirmDialog();

	useEffect(() => {
		const editor = editorRef.current;
		if (!editor) return;
		const nextValue = typeof value === 'string' ? value : '';
		if (editor.innerHTML !== nextValue) {
			editor.innerHTML = nextValue;
		}
	}, [value]);

	function emitChange() {
		const editor = editorRef.current;
		if (!editor || typeof onChange !== 'function') return;
		onChange(editor.innerHTML);
	}

	function runCommand(command, commandValue) {
		if (disabled || typeof document === 'undefined') return;
		const editor = editorRef.current;
		if (!editor) return;
		editor.focus();
		document.execCommand(command, false, commandValue);
		emitChange();
	}

	async function onAddLink() {
		if (disabled) return;
		const link = await requestPrompt({
			message: 'Enter URL',
			initialValue: 'https://',
			inputLabel: 'URL',
			confirmLabel: 'Insert Link',
			cancelLabel: 'Cancel',
			required: true
		});
		if (!link) return;
		runCommand('createLink', link);
	}

	const resolvedToolbarActions = Array.isArray(toolbarActions) ? toolbarActions : [];

	return (
		<div className={disabled ? 'rich-text-editor is-disabled' : 'rich-text-editor'}>
			<div className="rich-text-toolbar" role="toolbar" aria-label="Text formatting controls">
				{toolbarItems.map((item) => (
					<button
						key={item.command}
						type="button"
						className="rich-text-tool"
						title={item.title}
						aria-label={item.title}
						disabled={disabled}
						onClick={() => runCommand(item.command)}
					>
						<item.Icon size={15} strokeWidth={2.1} aria-hidden="true" />
					</button>
				))}
				<button
					type="button"
					className="rich-text-tool"
					title="Add Link"
					aria-label="Add Link"
					disabled={disabled}
					onClick={onAddLink}
				>
					<Link2 size={15} strokeWidth={2.1} aria-hidden="true" />
				</button>
				{resolvedToolbarActions.map((action, index) => {
					const key = action?.key || `toolbar-action-${index}`;
					const isLoading = Boolean(action?.loading);
					const label = isLoading
						? action?.loadingLabel || action?.label || 'Working...'
						: action?.label || 'Action';
					const isIconOnly = Boolean(action?.iconOnly);
					const Icon = action?.icon;
					const className = [
						'rich-text-tool',
						isIconOnly ? 'rich-text-tool-icon-action' : 'rich-text-tool-text',
						index === 0 ? 'rich-text-tool-action-anchor' : ''
					]
						.filter(Boolean)
						.join(' ');

					return (
						<button
							key={key}
							type="button"
							className={className}
							title={action?.title || label}
							aria-label={action?.title || label}
							disabled={disabled || Boolean(action?.disabled) || typeof action?.onClick !== 'function'}
							onClick={action?.onClick}
						>
							{isIconOnly ? (
								isLoading ? (
									<LoaderCircle size={15} strokeWidth={2.1} aria-hidden="true" className="row-action-icon-spinner" />
								) : Icon ? (
									<Icon size={15} strokeWidth={2.1} aria-hidden="true" />
								) : (
									label
								)
							) : (
								label
							)}
						</button>
					);
				})}
			</div>
			<div
				ref={editorRef}
				className="rich-text-surface"
				contentEditable={!disabled}
				suppressContentEditableWarning
				role="textbox"
				aria-label={ariaLabel}
				aria-multiline="true"
				onInput={emitChange}
				onBlur={emitChange}
			/>
		</div>
	);
}
