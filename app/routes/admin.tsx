import { Badge, Button, Dialog, Input } from "@cloudflare/kumo";
import {
	ArrowLeftIcon,
	GearIcon,
	KeyIcon,
	MailboxIcon,
	PlusIcon,
	TrashIcon,
	UserPlusIcon,
	UsersIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import api, { ApiError } from "~/services/api";

export function meta() {
	return [{ title: "Admin — Agentic Inbox" }];
}

type Tab = "users" | "mailboxes";

export default function AdminRoute() {
	const navigate = useNavigate();
	const [tab, setTab] = useState<Tab>("users");

	const { data: me, isLoading: meLoading } = useQuery({
		queryKey: ["auth", "me"],
		queryFn: () => api.me(),
		retry: false,
	});

	if (meLoading) return null;
	if (!me?.user) return <Navigate to="/login" replace />;
	if (!me.isAdmin) {
		return (
			<div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-kumo-recessed">
				<UsersIcon size={40} weight="thin" className="text-kumo-subtle" />
				<h1 className="text-lg font-semibold text-kumo-default">
					Forbidden — admin only
				</h1>
				<p className="text-sm text-kumo-subtle">Your account is not a superadmin.</p>
				<Button variant="secondary" size="sm" onClick={() => navigate("/")}>
					Back to inbox
				</Button>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<header className="sticky top-0 z-10 border-b border-kumo-line bg-kumo-recessed/95 backdrop-blur">
				<div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-3.5">
					<Link
						to="/"
						className="flex items-center gap-1.5 text-sm text-kumo-subtle hover:text-kumo-default transition-colors"
					>
						<ArrowLeftIcon size={15} />
						Back
					</Link>
					<div className="flex items-center gap-2">
						<GearIcon size={18} className="text-kumo-default" />
						<h1 className="text-base font-semibold text-kumo-default">Admin</h1>
					</div>
					<div className="ml-auto flex items-center gap-1 rounded-lg border border-kumo-line bg-kumo-control p-0.5">
						<button
							type="button"
							onClick={() => setTab("users")}
							className={`rounded-md px-3 py-1.5 text-sm transition-colors cursor-pointer ${
								tab === "users"
									? "bg-kumo-tint font-semibold text-kumo-default"
									: "text-kumo-subtle hover:text-kumo-default"
							}`}
						>
							Users
						</button>
						<button
							type="button"
							onClick={() => setTab("mailboxes")}
							className={`rounded-md px-3 py-1.5 text-sm transition-colors cursor-pointer ${
								tab === "mailboxes"
									? "bg-kumo-tint font-semibold text-kumo-default"
									: "text-kumo-subtle hover:text-kumo-default"
							}`}
						>
							Mailboxes
						</button>
					</div>
				</div>
			</header>

			<main className="mx-auto max-w-5xl px-6 py-6">
				{tab === "users" ? <UsersPanel /> : <MailboxesPanel />}
			</main>
		</div>
	);
}

// -- Users ----------------------------------------------------------

function UsersPanel() {
	const queryClient = useQueryClient();
	const { data, isLoading } = useQuery({
		queryKey: ["admin", "users"],
		queryFn: () => api.listAdminUsers(),
	});
	const [createOpen, setCreateOpen] = useState(false);
	const [resetTarget, setResetTarget] = useState<{ email: string } | null>(null);

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: ["admin", "users"] });

	const createUser = useMutation({
		mutationFn: (v: { email: string; password: string }) =>
			api.createAdminUser(v.email, v.password),
		onSuccess: () => {
			setCreateOpen(false);
			invalidate();
		},
	});

	const resetPassword = useMutation({
		mutationFn: (v: { email: string; password: string }) =>
			api.resetAdminPassword(v.email, v.password),
		onSuccess: () => {
			setResetTarget(null);
			invalidate();
		},
	});

	const deleteUser = useMutation({
		mutationFn: (email: string) => api.deleteAdminUser(email),
		onSuccess: invalidate,
	});

	const users = data?.users ?? [];

	return (
		<div>
			<div className="mb-4 flex items-center justify-between">
				<h2 className="text-sm font-semibold text-kumo-default">
					{users.length} user{users.length !== 1 ? "s" : ""}
				</h2>
				<Button
					variant="primary"
					size="sm"
					icon={<UserPlusIcon size={15} />}
					onClick={() => setCreateOpen(true)}
				>
					Add user
				</Button>
			</div>

			{isLoading ? (
				<div className="animate-pulse space-y-2">
					{Array.from({ length: 4 }).map((_, i) => (
						<div key={i} className="h-12 rounded-lg bg-kumo-fill" />
					))}
				</div>
			) : (
				<div className="overflow-hidden rounded-xl border border-kumo-line bg-kumo-control">
					{users.map((u, i) => (
						<div
							key={u.id}
							className={`flex items-center gap-3 px-4 py-3 ${
								i > 0 ? "border-t border-kumo-line" : ""
							}`}
						>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<span className="truncate text-sm font-medium text-kumo-default">
										{u.email}
									</span>
									{u.isAdmin && (
										<Badge variant="secondary">admin</Badge>
									)}
								</div>
								<div className="text-xs text-kumo-subtle mt-0.5">
									{u.mailboxes.length} mailbox
									{u.mailboxes.length !== 1 ? "es" : ""} · created{" "}
									{new Date(u.created_at).toLocaleDateString()}
								</div>
							</div>
							<div className="flex shrink-0 items-center gap-1">
								<Button
									variant="ghost"
									shape="square"
									size="sm"
									icon={<KeyIcon size={15} />}
									onClick={() => setResetTarget({ email: u.email })}
									aria-label={`Reset password for ${u.email}`}
								/>
								<Button
									variant="ghost"
									shape="square"
									size="sm"
									icon={<TrashIcon size={15} />}
									onClick={() => {
										if (
											window.confirm(
												`Delete user ${u.email}? Their mailbox grants will be removed.`,
											)
										) {
											deleteUser.mutate(u.email);
										}
									}}
									aria-label={`Delete ${u.email}`}
								/>
							</div>
						</div>
					))}
				</div>
			)}

			{createOpen && (
				<UserFormDialog
					title="Add user"
					submitLabel="Create account"
					busy={createUser.isPending}
					error={createUser.error as ApiError | null}
					onSubmit={(email, password) => createUser.mutate({ email, password })}
					onClose={() => setCreateOpen(false)}
				/>
			)}

			{resetTarget && (
				<UserFormDialog
					title={`Reset password — ${resetTarget.email}`}
					submitLabel="Reset password"
					busy={resetPassword.isPending}
					error={resetPassword.error as ApiError | null}
					onSubmit={(_email, password) =>
						resetPassword.mutate({ email: resetTarget.email, password })
					}
					onClose={() => setResetTarget(null)}
				/>
			)}
		</div>
	);
}

function UserFormDialog({
	title,
	submitLabel,
	busy,
	error,
	onSubmit,
	onClose,
}: {
	title: string;
	submitLabel: string;
	busy: boolean;
	error: ApiError | null;
	onSubmit: (email: string, password: string) => void;
	onClose: () => void;
}) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	return (
		<Dialog.Root open onOpenChange={onClose}>
			<Dialog size="sm" className="p-6">
				<Dialog.Title className="text-base font-semibold mb-4">{title}</Dialog.Title>
				<form
					className="space-y-4"
					onSubmit={(e) => {
						e.preventDefault();
						onSubmit(email, password);
					}}
				>
					<Input
						label="Email"
						type="email"
						placeholder="user@example.com"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
					/>
					<Input
						label="Password"
						type="password"
						placeholder="min. 8 characters"
						autoComplete="new-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
					/>
					{error && (
						<p className="text-sm text-kumo-danger">
							{(error as Error).message}
						</p>
					)}
					<div className="flex justify-end gap-2">
						<Dialog.Close
							render={(props) => (
								<Button {...props} variant="secondary">
									Cancel
								</Button>
							)}
						/>
						<Button
							type="submit"
							variant="primary"
							loading={busy}
							disabled={!email || password.length < 8}
						>
							{submitLabel}
						</Button>
					</div>
				</form>
			</Dialog>
		</Dialog.Root>
	);
}

// -- Mailboxes ------------------------------------------------------

function MailboxesPanel() {
	const queryClient = useQueryClient();
	const usersQuery = useQuery({
		queryKey: ["admin", "users"],
		queryFn: () => api.listAdminUsers(),
	});
	const mailboxesQuery = useQuery({
		queryKey: ["admin", "mailboxes"],
		queryFn: () => api.listAdminMailboxes(),
	});
	const [createOpen, setCreateOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<{ id: string; settings: Record<string, unknown> } | null>(null);
	const [assignTarget, setAssignTarget] = useState<{ id: string } | null>(null);

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ["admin", "mailboxes"] });
		queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
	};

	const deleteMailbox = useMutation({
		mutationFn: (id: string) => api.deleteAdminMailbox(id),
		onSuccess: invalidate,
	});
	const unassign = useMutation({
		mutationFn: (v: { mailboxId: string; email: string }) =>
			api.unassignAdminMailbox(v.mailboxId, v.email),
		onSuccess: invalidate,
	});
	const assign = useMutation({
		mutationFn: (v: { mailboxId: string; email: string }) =>
			api.assignAdminMailbox(v.mailboxId, v.email),
		onSuccess: () => {
			setAssignTarget(null);
			invalidate();
		},
	});

	const mailboxes = mailboxesQuery.data?.mailboxes ?? [];
	const users = usersQuery.data?.users ?? [];

	return (
		<div>
			<div className="mb-4 flex items-center justify-between">
				<h2 className="text-sm font-semibold text-kumo-default">
					{mailboxes.length} mailbox{mailboxes.length !== 1 ? "es" : ""}
				</h2>
				<Button
					variant="primary"
					size="sm"
					icon={<PlusIcon size={15} />}
					onClick={() => setCreateOpen(true)}
				>
					Add mailbox
				</Button>
			</div>

			{mailboxesQuery.isLoading ? (
				<div className="animate-pulse space-y-2">
					{Array.from({ length: 4 }).map((_, i) => (
						<div key={i} className="h-12 rounded-lg bg-kumo-fill" />
					))}
				</div>
			) : (
				<div className="overflow-hidden rounded-xl border border-kumo-line bg-kumo-control">
					{mailboxes.map((m, i) => (
						<div
							key={m.id}
							className={`flex items-center gap-3 px-4 py-3 ${
								i > 0 ? "border-t border-kumo-line" : ""
							}`}
						>
							<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-kumo-tint">
								<MailboxIcon size={15} className="text-kumo-default" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm font-medium text-kumo-default">
									{m.id}
								</div>
								<div className="flex flex-wrap items-center gap-1.5 text-xs text-kumo-subtle mt-0.5">
									{(() => {
										const fromName = (m.settings as { fromName?: string })?.fromName;
										const fwd = (m.settings as { forwarding?: { enabled?: boolean; email?: string } })?.forwarding;
										const sig = (m.settings as { signature?: { enabled?: boolean } })?.signature;
										const auto = (m.settings as { autoReply?: { enabled?: boolean } })?.autoReply;
										return [
											fromName && <Badge key="n" variant="secondary">{fromName}</Badge>,
											fwd?.enabled && <Badge key="f" variant="secondary">forwarding → {fwd.email || "?"}</Badge>,
											sig?.enabled && <Badge key="s" variant="secondary">signature</Badge>,
											auto?.enabled && <Badge key="a" variant="secondary">auto-reply</Badge>,
										].filter(Boolean);
									})()}
								</div>
								<div className="text-xs text-kumo-subtle mt-1">
									Owners:{" "}
									{m.owners.length === 0 ? (
										<span className="text-kumo-danger">none</span>
									) : (
										m.owners.join(", ")
									)}
								</div>
							</div>
							<div className="flex shrink-0 items-center gap-1">
								<Button
									variant="ghost"
									size="sm"
									icon={<KeyIcon size={14} />}
									onClick={() => setAssignTarget({ id: m.id })}
								>
									Assign
								</Button>
								<Button
									variant="ghost"
									shape="square"
									size="sm"
									icon={<GearIcon size={15} />}
									onClick={() => setEditTarget({ id: m.id, settings: m.settings })}
									aria-label={`Settings for ${m.id}`}
								/>
								<Button
									variant="ghost"
									shape="square"
									size="sm"
									icon={<TrashIcon size={15} />}
									onClick={() => {
										if (
											window.confirm(
												`Delete mailbox ${m.id}? This removes the mailbox, its folders and grants (emails in R2 are kept but orphaned).`,
											)
										) {
											deleteMailbox.mutate(m.id);
										}
									}}
									aria-label={`Delete ${m.id}`}
								/>
							</div>
						</div>
					))}
				</div>
			)}

			{createOpen && (
				<CreateMailboxDialog
					busy={false}
					onSubmit={async (email, name, ownerEmail) => {
						await api.createAdminMailbox(email, name, ownerEmail || undefined);
						setCreateOpen(false);
						invalidate();
					}}
					onClose={() => setCreateOpen(false)}
				/>
			)}

			{editTarget && (
				<MailboxSettingsDialog
					mailboxId={editTarget.id}
					initial={editTarget.settings}
					onClose={() => setEditTarget(null)}
					onSaved={invalidate}
				/>
			)}

			{assignTarget && (
				<Dialog.Root open onOpenChange={() => setAssignTarget(null)}>
					<Dialog size="sm" className="p-6">
						<Dialog.Title className="text-base font-semibold mb-4">
							Assign {assignTarget.id}
						</Dialog.Title>
						<div className="space-y-1">
							{users.map((u) => {
								const owned = (mailboxes.find((m) => m.id === assignTarget.id)?.owners ?? []).includes(u.email);
								return (
									<div
										key={u.id}
										className="flex items-center justify-between rounded-lg border border-kumo-line px-3 py-2"
									>
										<span className="text-sm text-kumo-default truncate">{u.email}</span>
										{owned ? (
											<Button
												variant="ghost"
												size="sm"
												onClick={() =>
													unassign.mutate({ mailboxId: assignTarget.id, email: u.email })
												}
											>
												Revoke
											</Button>
										) : (
											<Button
												variant="secondary"
												size="sm"
												disabled={assign.isPending}
												onClick={() =>
													assign.mutate({ mailboxId: assignTarget.id, email: u.email })
												}
											>
												Grant
											</Button>
										)}
									</div>
								);
							})}
						</div>
						<div className="mt-4 flex justify-end">
							<Button variant="secondary" onClick={() => setAssignTarget(null)}>
								Done
							</Button>
						</div>
					</Dialog>
				</Dialog.Root>
			)}
		</div>
	);
}

function CreateMailboxDialog({
	busy,
	onSubmit,
	onClose,
}: {
	busy: boolean;
	onSubmit: (email: string, name: string, ownerEmail: string) => Promise<void>;
	onClose: () => void;
}) {
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [ownerEmail, setOwnerEmail] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	return (
		<Dialog.Root open onOpenChange={onClose}>
			<Dialog size="sm" className="p-6">
				<Dialog.Title className="text-base font-semibold mb-4">
					Add mailbox
				</Dialog.Title>
				<form
					className="space-y-4"
					onSubmit={async (e) => {
						e.preventDefault();
						setSubmitting(true);
						setError(null);
						try {
							await onSubmit(email, name || email.split("@")[0], ownerEmail);
						} catch (err) {
							setError((err as Error).message);
						} finally {
							setSubmitting(false);
						}
					}}
				>
					<Input
						label="Email address"
						type="email"
						placeholder="info@dika.my.id"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
					/>
					<Input
						label="Display name"
						placeholder="Info"
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
					<Input
						label="Owner (optional)"
						type="email"
						placeholder="user@example.com"
						value={ownerEmail}
						onChange={(e) => setOwnerEmail(e.target.value)}
					/>
					{error && <p className="text-sm text-kumo-danger">{error}</p>}
					<div className="flex justify-end gap-2">
						<Dialog.Close
							render={(props) => (
								<Button {...props} variant="secondary">
									Cancel
								</Button>
							)}
						/>
						<Button
							type="submit"
							variant="primary"
							loading={submitting || busy}
							disabled={!email}
						>
							Create
						</Button>
					</div>
				</form>
			</Dialog>
		</Dialog.Root>
	);
}

function MailboxSettingsDialog({
	mailboxId,
	initial,
	onClose,
	onSaved,
}: {
	mailboxId: string;
	initial: Record<string, unknown>;
	onClose: () => void;
	onSaved: () => void;
}) {
	const [fromName, setFromName] = useState(
		String((initial as { fromName?: unknown })?.fromName ?? ""),
	);
	const [fwdEnabled, setFwdEnabled] = useState(
		Boolean((initial as { forwarding?: { enabled?: boolean } })?.forwarding?.enabled),
	);
	const [fwdEmail, setFwdEmail] = useState(
		String((initial as { forwarding?: { email?: string } })?.forwarding?.email ?? ""),
	);
	const [sigEnabled, setSigEnabled] = useState(
		Boolean((initial as { signature?: { enabled?: boolean } })?.signature?.enabled),
	);
	const [sigText, setSigText] = useState(
		String((initial as { signature?: { text?: string } })?.signature?.text ?? ""),
	);
	const [autoEnabled, setAutoEnabled] = useState(
		Boolean((initial as { autoReply?: { enabled?: boolean } })?.autoReply?.enabled),
	);
	const [autoSubject, setAutoSubject] = useState(
		String((initial as { autoReply?: { subject?: string } })?.autoReply?.subject ?? ""),
	);
	const [autoMessage, setAutoMessage] = useState(
		String((initial as { autoReply?: { message?: string } })?.autoReply?.message ?? ""),
	);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const save = async () => {
		setSaving(true);
		setError(null);
		try {
			const settings = {
				...initial,
				fromName,
				forwarding: { enabled: fwdEnabled, email: fwdEmail },
				signature: { enabled: sigEnabled, text: sigText },
				autoReply: { enabled: autoEnabled, subject: autoSubject, message: autoMessage },
			};
			await api.deployAdminMailboxSettings(mailboxId, settings);
			onSaved();
			onClose();
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog.Root open onOpenChange={onClose}>
			<Dialog className="p-6 max-h-[85vh] overflow-y-auto">
				<Dialog.Title className="text-base font-semibold mb-1">
					Settings — {mailboxId}
				</Dialog.Title>
				<Dialog.Description className="text-sm text-kumo-subtle mb-4">
					These apply to emails sent from this mailbox (via Cloudflare Email Service).
				</Dialog.Description>
				<div className="space-y-4">
					<Input
						label="Display name (from)"
						value={fromName}
						onChange={(e) => setFromName(e.target.value)}
						placeholder="e.g. Dika"
					/>

					<div className="rounded-lg border border-kumo-line p-3.5 space-y-3">
						<label className="flex items-center gap-2 text-sm font-medium text-kumo-default">
							<input
								type="checkbox"
								checked={fwdEnabled}
								onChange={(e) => setFwdEnabled(e.target.checked)}
								className="accent-kumo-brand"
							/>
							Forwarding
						</label>
						{fwdEnabled && (
							<Input
								label="Forward to"
								type="email"
								value={fwdEmail}
								onChange={(e) => setFwdEmail(e.target.value)}
								placeholder="target@example.com"
							/>
						)}
					</div>

					<div className="rounded-lg border border-kumo-line p-3.5 space-y-3">
						<label className="flex items-center gap-2 text-sm font-medium text-kumo-default">
							<input
								type="checkbox"
								checked={sigEnabled}
								onChange={(e) => setSigEnabled(e.target.checked)}
								className="accent-kumo-brand"
							/>
							Signature
						</label>
						{sigEnabled && (
							<textarea
								value={sigText}
								onChange={(e) => setSigText(e.target.value)}
								placeholder="Best regards,&#10;Dika"
								rows={3}
								className="w-full rounded-lg border border-kumo-line bg-kumo-base px-3 py-2 text-sm text-kumo-default outline-none focus:ring-1 focus:ring-kumo-ring resize-y"
							/>
						)}
					</div>

					<div className="rounded-lg border border-kumo-line p-3.5 space-y-3">
						<label className="flex items-center gap-2 text-sm font-medium text-kumo-default">
							<input
								type="checkbox"
								checked={autoEnabled}
								onChange={(e) => setAutoEnabled(e.target.checked)}
								className="accent-kumo-brand"
							/>
							Auto-reply
						</label>
						{autoEnabled && (
							<>
								<Input
									label="Subject"
									value={autoSubject}
									onChange={(e) => setAutoSubject(e.target.value)}
									placeholder="Re: ..."
								/>
								<textarea
									value={autoMessage}
									onChange={(e) => setAutoMessage(e.target.value)}
									placeholder="Thank you for your email..."
									rows={4}
									className="w-full rounded-lg border border-kumo-line bg-kumo-base px-3 py-2 text-sm text-kumo-default outline-none focus:ring-1 focus:ring-kumo-ring resize-y"
								/>
							</>
						)}
					</div>

					{error && <p className="text-sm text-kumo-danger">{error}</p>}

					<div className="flex justify-end gap-2 pt-1">
						<Button variant="secondary" onClick={onClose}>
							Cancel
						</Button>
						<Button variant="primary" loading={saving} onClick={save}>
							Save settings
						</Button>
					</div>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}
