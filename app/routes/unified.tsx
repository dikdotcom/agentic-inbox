import { Button, Loader } from "@cloudflare/kumo";
import { ArchiveIcon, ArrowLeftIcon, TrayIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import api from "~/services/api";
import { queryKeys } from "~/queries/keys";
import { formatListDate } from "shared/dates";
import { getSnippetText } from "~/lib/utils";
import type { Email } from "~/types";

interface UnifiedResponse {
	emails: (Email & { mailbox: string })[];
	totalCount: number;
}

const AVATAR_GRADIENTS = [
	"linear-gradient(135deg, #e05252, #c0392b)",
	"linear-gradient(135deg, #5294e0, #2980b9)",
	"linear-gradient(135deg, #52c07a, #27ae60)",
	"linear-gradient(135deg, #c8a44e, #a0833d)",
	"linear-gradient(135deg, #9b59b6, #8e44ad)",
	"linear-gradient(135deg, #e67e22, #d35400)",
	"linear-gradient(135deg, #1abc9c, #16a085)",
];

export default function UnifiedRoute() {
	const navigate = useNavigate();
	const { data, isFetching } = useQuery<UnifiedResponse>({
		queryKey: queryKeys.emails.unified(),
		queryFn: () => api.unifiedEmails({ limit: "50" }) as Promise<UnifiedResponse>,
		refetchInterval: 30_000,
	});

	const emails = data?.emails ?? [];

	return (
		<div className="h-full flex flex-col">
			<div className="flex items-center justify-between px-4 py-3.5 border-b border-kumo-line shrink-0 md:px-6">
				<div className="flex items-center gap-3">
					<Button
						variant="ghost"
						shape="square"
						size="sm"
						icon={<ArrowLeftIcon size={18} />}
						onClick={() => navigate("/")}
						aria-label="Back"
						className="md:hidden"
					/>
					<h1 className="text-lg font-semibold text-kumo-default">Unified Inbox</h1>
				</div>
				<span className="text-sm text-kumo-subtle">
					{data?.totalCount ?? 0} email{(data?.totalCount ?? 0) !== 1 ? "s" : ""}
				</span>
			</div>

			<div className="flex-1 overflow-y-auto">
				{isFetching && emails.length === 0 ? (
					<div className="flex justify-center py-20">
						<Loader size="lg" />
					</div>
				) : emails.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-24 text-kumo-subtle">
						<TrayIcon size={48} weight="thin" className="mb-3" />
						<p className="text-sm">No emails across your mailboxes</p>
					</div>
				) : (
					<div>
						{emails.map((email) => {
							const src = email.sender || email.participants || email.id;
							let h = 0;
							for (let i = 0; i < src.length; i++) h = (h * 31 + src.charCodeAt(i)) >>> 0;
							const gradient = AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
							const initials = (email.sender.split("@")[0].slice(0, 2)).toUpperCase();
							return (
								<button
									key={email.id}
									type="button"
									onClick={() => navigate(`/mailbox/${email.mailbox}/emails/inbox`)}
									className="group flex w-full items-center gap-3 border-b border-kumo-line px-4 py-3 text-left transition-colors hover:bg-kumo-tint/60 md:px-6"
								>
									<div
										className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-xs font-bold text-[#09090b]"
										style={{ background: gradient }}
									>
										{initials}
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-baseline justify-between gap-2">
											<span className={`truncate text-sm ${email.read ? "text-kumo-default" : "font-semibold text-kumo-strong"}`}>
												{email.sender}
											</span>
											<span className="shrink-0 text-[11px] text-kumo-subtle">{formatListDate(email.date)}</span>
										</div>
										<div className="truncate text-xs font-medium text-kumo-default">{email.subject || "(no subject)"}</div>
										<div className="mt-0.5 flex items-center gap-2">
											<span className="truncate text-xs text-kumo-subtle">{getSnippetText(email.snippet)}</span>
											<span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-kumo-fill px-2 py-0.5 text-[10px] text-kumo-subtle">
												<ArchiveIcon size={10} />
												{email.mailbox}
											</span>
										</div>
									</div>
								</button>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
