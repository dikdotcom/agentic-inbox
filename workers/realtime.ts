// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./types";

/**
 * RealtimeHub — fan-out WebSocket hub for inbox updates.
 *
 * Clients connect to /api/v1/ws (authenticated via session cookie),
 * then send { type: "subscribe", mailboxId }. When the mail worker
 * stores a new email it POSTs to /notify and the hub broadcasts
 * { type: "emails.changed", mailboxId } to matching sockets.
 *
 * Classic (non-hibernatable) DO: stays awake while sockets are open,
 * so the in-memory subscriber map survives between messages.
 */
export class RealtimeHub extends DurableObject {
	private subscribers = new Map<string, Set<WebSocket>>();

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/notify") {
			const body = (await request.json().catch(() => null)) as {
				mailboxId?: string;
			} | null;
			if (body?.mailboxId) this.broadcast(body.mailboxId.toLowerCase());
			return new Response("ok");
		}

		// WebSocket upgrade
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		this.ctx.acceptWebSocket(server);

		server.addEventListener("message", (event) => {
			try {
				const msg = JSON.parse(String(event.data)) as {
					type?: string;
					mailboxId?: string;
				};
				if (msg.type === "subscribe" && typeof msg.mailboxId === "string") {
					const key = msg.mailboxId.toLowerCase();
					const set = this.subscribers.get(key) ?? new Set();
					set.add(server);
					this.subscribers.set(key, set);
				}
			} catch {
				// ignore malformed frames
			}
		});

		const remove = () => this.removeSocket(server);
		server.addEventListener("close", remove);
		server.addEventListener("error", remove);

		return new Response(null, { status: 101, webSocket: client });
	}

	private broadcast(mailboxId: string) {
		const set = this.subscribers.get(mailboxId);
		if (!set || set.size === 0) return;
		const payload = JSON.stringify({ type: "emails.changed", mailboxId });
		for (const ws of [...set]) {
			try {
				ws.send(payload);
			} catch {
				this.removeSocket(ws);
			}
		}
	}

	private removeSocket(ws: WebSocket) {
		for (const [key, set] of this.subscribers) {
			if (set.delete(ws)) {
				if (set.size === 0) this.subscribers.delete(key);
				return;
			}
		}
	}
}

export type { Env };
