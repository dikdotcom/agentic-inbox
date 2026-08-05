import type { UsersDO } from "./usersDO";

export interface AuthUser {
	id: string;
	email: string;
}

export interface Env extends Cloudflare.Env {
	// Auth (replaces Cloudflare Access)
	USERS: DurableObjectNamespace<UsersDO>;
	// Optional shared token protecting the MCP endpoint. If unset, /mcp is disabled.
	MCP_TOKEN?: string;
}
