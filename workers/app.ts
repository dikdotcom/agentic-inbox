// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { routeAgentRequest } from "agents";
import { Hono } from "hono";
import { createRequestHandler } from "react-router";
import { app as apiApp, receiveEmail } from "./index";
import { EmailMCP } from "./mcp";
import { authMiddleware, authRoutes, type AuthEnv } from "./auth";
import { adminRoutes } from "./routes/admin";
import type { Env } from "./types";

export { MailboxDO } from "./durableObject";
export { EmailAgent } from "./agent";
export { EmailMCP } from "./mcp";
export { UsersDO } from "./usersDO";

declare module "react-router" {
	export interface AppLoadContext {
		cloudflare: {
			env: Env;
			ctx: ExecutionContext;
		};
	}
}

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

// Main app that wraps the API and adds React Router fallback
const app = new Hono<AuthEnv>();

// Global auth gate (replaces Cloudflare Access). Valid session cookie is
// required for everything except the login page, auth endpoints, and assets.
app.use("*", authMiddleware);

// MCP server endpoint — used by AI coding tools (ProtoAgent, Claude Code, Cursor, etc.)
// Protected by a shared bearer token (MCP_TOKEN). If MCP_TOKEN is not set,
// the endpoint is disabled entirely (fail closed).
app.all("/mcp", async (c, next) => {
	const token = c.env.MCP_TOKEN;
	if (!token) {
		return c.text("MCP is disabled: MCP_TOKEN is not configured", 503);
	}
	const auth = c.req.header("authorization") ?? "";
	if (auth !== `Bearer ${token}`) {
		return c.text("Unauthorized", 401);
	}
	return next();
});
app.all("/mcp/*", async (c, next) => {
	const token = c.env.MCP_TOKEN;
	if (!token) {
		return c.text("MCP is disabled: MCP_TOKEN is not configured", 503);
	}
	const auth = c.req.header("authorization") ?? "";
	if (auth !== `Bearer ${token}`) {
		return c.text("Unauthorized", 401);
	}
	return next();
});

// Auth endpoints (login/register/logout/me)
app.route("/api/auth", authRoutes);

// Admin-only endpoints (superadmin = email in ADMIN_EMAILS)
app.route("/api/v1/admin", adminRoutes);

// Mount the API routes
app.route("/", apiApp);

// Agent WebSocket routing - must be before React Router catch-all
app.all("/agents/*", async (c) => {
	const response = await routeAgentRequest(c.req.raw, c.env);
	if (response) return response;
	return c.text("Agent not found", 404);
});

// React Router catch-all: serves the SPA for all non-API routes
app.all("*", (c) => {
	return requestHandler(c.req.raw, {
		cloudflare: { env: c.env, ctx: c.executionCtx as ExecutionContext },
	});
});

// Export the Hono app as the default export with an email handler
export default {
	fetch: app.fetch,
	async email(
		event: { raw: ReadableStream; rawSize: number },
		env: Env,
		ctx: ExecutionContext,
	) {
		try {
			await receiveEmail(event, env, ctx);
		} catch (e) {
			console.error("Failed to process incoming email:", (e as Error).message, (e as Error).stack);
			// Re-throw so Cloudflare's email routing can retry delivery or bounce the message.
			// Swallowing the error would silently drop the email.
			throw e;
		}
	},
};
