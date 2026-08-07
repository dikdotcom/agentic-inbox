// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { RobotIcon, ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useMailbox, useUpdateMailbox } from "~/queries/mailboxes";

// Placeholder shown in the textarea when no custom prompt is set.
// The authoritative default prompt lives in workers/agent/index.ts (DEFAULT_SYSTEM_PROMPT).
const PROMPT_PLACEHOLDER = `You are an email assistant that helps manage this inbox. You read emails, draft replies, and help organize conversations.\n\nWrite like a real person. Short, direct, flowing prose. Plain text only.\n\n(Leave empty to use the full built-in default prompt)`;

export default function SettingsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const toastManager = useKumoToastManager();
	const { data: mailbox } = useMailbox(mailboxId);
	const updateMailboxMutation = useUpdateMailbox();

	const [displayName, setDisplayName] = useState("");
	const [agentPrompt, setAgentPrompt] = useState("");
	const [autoDraft, setAutoDraft] = useState(true);
	const [fwdEnabled, setFwdEnabled] = useState(false);
	const [fwdEmail, setFwdEmail] = useState("");
	const [autoEnabled, setAutoEnabled] = useState(false);
	const [autoSubject, setAutoSubject] = useState("");
	const [autoMessage, setAutoMessage] = useState("");
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (mailbox) {
			const s = mailbox.settings as Record<string, any> | undefined;
			setDisplayName(mailbox.settings?.fromName || mailbox.name || "");
			setAgentPrompt(mailbox.settings?.agentSystemPrompt || "");
			setAutoDraft(s?.autoDraft !== false);
			setFwdEnabled(Boolean(s?.forwarding?.enabled));
			setFwdEmail(String(s?.forwarding?.email ?? ""));
			setAutoEnabled(Boolean(s?.autoReply?.enabled));
			setAutoSubject(String(s?.autoReply?.subject ?? ""));
			setAutoMessage(String(s?.autoReply?.message ?? ""));
		}
	}, [mailbox]);

	const handleSave = async () => {
		if (!mailbox || !mailboxId) return;
		setIsSaving(true);
		const settings = {
			...mailbox.settings,
			fromName: displayName,
			agentSystemPrompt: agentPrompt.trim() || undefined,
			autoDraft,
			forwarding: { enabled: fwdEnabled, email: fwdEmail.trim() },
			autoReply: { enabled: autoEnabled, subject: autoSubject.trim(), message: autoMessage.trim() },
		};
		try {
			await updateMailboxMutation.mutateAsync({ mailboxId, settings });
			toastManager.add({ title: "Settings saved!" });
		} catch {
			toastManager.add({
				title: "Failed to save settings",
				variant: "error",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const handleResetPrompt = () => {
		setAgentPrompt("");
	};

	if (!mailbox) {
		return (
			<div className="flex justify-center py-20">
				<Loader size="lg" />
			</div>
		);
	}

	const isCustomPrompt = agentPrompt.trim().length > 0;

	return (
		<div className="max-w-2xl px-4 py-4 md:px-8 md:py-6 h-full overflow-y-auto">
			<h1 className="text-lg font-semibold text-kumo-default mb-6">Settings</h1>

			<div className="space-y-6">
				{/* Account */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="text-sm font-medium text-kumo-default mb-4">
						Account
					</div>
					<div className="space-y-3">
						<Input
							label="Display Name"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
						/>
						<Input label="Email" type="email" value={mailbox.email} disabled />
					</div>
				</div>

				{/* Agent System Prompt */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-2">
							<RobotIcon size={16} weight="duotone" className="text-kumo-subtle" />
							<span className="text-sm font-medium text-kumo-default">
								AI Agent Prompt
							</span>
							{isCustomPrompt ? (
								<Badge variant="primary">Custom</Badge>
							) : (
								<Badge variant="secondary">Default</Badge>
							)}
						</div>
						{isCustomPrompt && (
							<Button
								variant="ghost"
								size="xs"
								icon={<ArrowCounterClockwiseIcon size={14} />}
								onClick={handleResetPrompt}
							>
								Reset to default
							</Button>
						)}
					</div>
					<p className="text-xs text-kumo-subtle mb-3">
						Customize how the AI agent behaves for this mailbox.
						Leave empty to use the built-in default prompt.
					</p>
					<textarea
						value={agentPrompt}
						onChange={(e) => setAgentPrompt(e.target.value)}
						placeholder={PROMPT_PLACEHOLDER}
						rows={12}
						className="w-full resize-y rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-xs text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring font-mono leading-relaxed"
					/>
					<p className="text-xs text-kumo-subtle mt-2">
						The prompt is sent as the system message to the AI model.
						It controls the agent's personality, writing style, and behavior rules.
					</p>
					<div className="mt-4 flex items-center justify-between gap-4 border-t border-kumo-line pt-4">
						<div>
							<p className="text-sm text-kumo-default">Auto-draft on new email</p>
							<p className="text-xs text-kumo-subtle mt-0.5">
								Let the agent automatically draft a reply when a new email arrives.
								Turn off to review each email manually.
							</p>
						</div>
						<input
							type="checkbox"
							checked={autoDraft}
							onChange={(e) => setAutoDraft(e.target.checked)}
							className="h-4 w-4 shrink-0 accent-[#c8a44e]"
							aria-label="Auto-draft on new email"
						/>
					</div>
				</div>

				{/* Forwarding */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-1">
						<span className="text-sm font-medium text-kumo-default">Forwarding</span>
						<input
							type="checkbox"
							checked={fwdEnabled}
							onChange={(e) => setFwdEnabled(e.target.checked)}
							className="h-4 w-4 accent-[#c8a44e]"
							aria-label="Enable forwarding"
						/>
					</div>
					<p className="text-xs text-kumo-subtle mb-3">
						Relay every incoming email to another address.
					</p>
					<Input
						label="Forward to"
						type="email"
						placeholder="you@elsewhere.com"
						value={fwdEmail}
						disabled={!fwdEnabled}
						onChange={(e) => setFwdEmail(e.target.value)}
					/>
				</div>

				{/* Auto-reply */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-1">
						<span className="text-sm font-medium text-kumo-default">Auto-reply</span>
						<input
							type="checkbox"
							checked={autoEnabled}
							onChange={(e) => setAutoEnabled(e.target.checked)}
							className="h-4 w-4 accent-[#c8a44e]"
							aria-label="Enable auto-reply"
						/>
					</div>
					<p className="text-xs text-kumo-subtle mb-3">
						Automatically reply to incoming email (skips other auto-responders to avoid loops).
					</p>
					<div className="space-y-3">
						<Input
							label="Subject"
							placeholder="Re: your email"
							value={autoSubject}
							disabled={!autoEnabled}
							onChange={(e) => setAutoSubject(e.target.value)}
						/>
						<div>
							<label className="block text-xs font-medium text-kumo-default mb-1">Message</label>
							<textarea
								value={autoMessage}
								disabled={!autoEnabled}
								onChange={(e) => setAutoMessage(e.target.value)}
								placeholder="Thanks for your email — I'll get back to you soon."
								rows={4}
								className="w-full resize-y rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-xs text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring font-mono leading-relaxed"
							/>
						</div>
					</div>
				</div>

				{/* Save */}
				<div className="flex justify-end">
					<Button variant="primary" onClick={handleSave} loading={isSaving}>
						Save Changes
					</Button>
				</div>
			</div>
		</div>
	);
}
