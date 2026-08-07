import { useKumoToastManager } from "@cloudflare/kumo";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

/**
 * Connects to the realtime hub (/api/v1/ws) and, on "emails.changed" for
 * the given mailbox, invalidates the email/folder queries and fires a
 * browser notification + toast. Auto-reconnects with backoff.
 */
export function useRealtime(mailboxId?: string) {
	const queryClient = useQueryClient();
	const toastManager = useKumoToastManager();
	const [retry, setRetry] = useState(0);
	const wsRef = useRef<WebSocket | null>(null);

	useEffect(() => {
		if (!mailboxId) return;
		let disposed = false;

		// Ask for notification permission once (if supported & undecided)
		if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
			Notification.requestPermission().catch(() => {});
		}

		const proto = window.location.protocol === "https:" ? "wss" : "ws";
		const ws = new WebSocket(`${proto}://${window.location.host}/api/v1/ws`);
		wsRef.current = ws;

		ws.onopen = () => {
			ws.send(JSON.stringify({ type: "subscribe", mailboxId }));
		};

		ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(String(event.data)) as {
					type?: string;
					mailboxId?: string;
				};
				if (msg.type === "emails.changed" && msg.mailboxId === mailboxId) {
					queryClient.invalidateQueries({ queryKey: ["emails", mailboxId] });
					queryClient.invalidateQueries({ queryKey: ["folders", mailboxId] });
					toastManager.add({ title: "New email", description: mailboxId });
					if ("Notification" in window && Notification.permission === "granted") {
						new Notification(`New email — ${mailboxId}`);
					}
				}
			} catch {
				// ignore
			}
		};

		ws.onclose = () => {
			if (disposed) return;
			// reconnect with backoff (5s base * attempt)
			const delay = Math.min(5000 * Math.pow(1.6, retry), 30000);
			setTimeout(() => setRetry((r) => r + 1), delay);
		};

		return () => {
			disposed = true;
			ws.close();
			wsRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mailboxId, retry]);
}