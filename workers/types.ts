import type { UsersDO } from "./usersDO";
import type { RealtimeHub } from "./realtime";

export interface AuthUser {
	id: string;
	email: string;
}

export interface Env extends Cloudflare.Env {
	// Auth (replaces Cloudflare Access)
	USERS: DurableObjectNamespace<UsersDO>;
	// Real-time inbox notification hub
	REALTIME: DurableObjectNamespace<RealtimeHub>;
	// Optional shared token protecting the MCP endpoint. If unset, /mcp is disabled.
	MCP_TOKEN?: string;
	// Auth secrets — provisioned via `wrangler secret put`, NOT vars
	// (a var with the same name blocks the secret with CF error 10053).
	SESSION_SECRET?: string;
	ADMIN_EMAILS?: string;
	ALLOW_REGISTRATION?: string;
}
