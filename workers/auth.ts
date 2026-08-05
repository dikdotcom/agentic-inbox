import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import type { Env, AuthUser } from "./types";

export type AuthEnv = {
	Bindings: Env;
	Variables: { user: AuthUser };
};

export const SESSION_COOKIE = "session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const PBKDF2_ITERATIONS = 100_000;
const MIN_SECRET_LENGTH = 32;

// Works under Vite bundling (import.meta.env.DEV) and plain Node (env undefined).
const IS_DEV = (import.meta as { env?: Record<string, unknown> }).env?.DEV === true;

/**
 * A session secret is only acceptable if it's long enough and not the
 * dev-only placeholder from wrangler.jsonc vars. Production deploys that
 * forget `wrangler secret put SESSION_SECRET` must fail closed.
 */
export function validSessionSecret(secret: string | undefined): boolean {
	return !!secret && secret.length >= MIN_SECRET_LENGTH && !secret.includes("dev-only-insecure");
}

function b64url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes));
}

function unb64url(b64: string): Uint8Array {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

// -- Password hashing (WebCrypto PBKDF2-SHA256, no native deps) ------

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
		keyMaterial,
		256,
	);
	return `pbkdf2$${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(new Uint8Array(bits))}`;
}

export async function verifyPassword(
	password: string,
	stored: string,
): Promise<boolean> {
	const parts = stored.split("$");
	if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
	const iterations = Number(parts[1]);
	const salt = unb64url(parts[2]);
	const expected = unb64url(parts[3]);

	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt: salt.slice().buffer as ArrayBuffer, iterations, hash: "SHA-256" },
		keyMaterial,
		256,
	);

	const actual = new Uint8Array(bits);
	if (actual.length !== expected.length) return false;
	let diff = 0;
	for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
	return diff === 0;
}

// -- Session JWT (HS256, signed with SESSION_SECRET) ------------------

export async function signSession(
	user: AuthUser,
	secret: string,
): Promise<string> {
	return new SignJWT({ email: user.email })
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(user.id)
		.setIssuedAt()
		.setExpirationTime("30d")
		.sign(new TextEncoder().encode(secret));
}

export async function verifySession(
	token: string,
	secret: string,
): Promise<AuthUser | null> {
	try {
		const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
			algorithms: ["HS256"],
		});
		if (!payload.sub || typeof payload.email !== "string") return null;
		return { id: payload.sub, email: payload.email };
	} catch {
		return null;
	}
}

function isPublicPath(path: string): boolean {
	return (
		path === "/login" ||
		path.startsWith("/assets/") ||
		path.startsWith("/favicon") ||
		path === "/api/auth/login" ||
		path === "/api/auth/register" ||
		path === "/api/auth/logout"
	);
}

/**
 * Replaces Cloudflare Access as the global gate.
 * - Valid session cookie -> set c.var.user and continue.
 * - Public paths (login page, auth endpoints, static assets) pass through.
 * - /mcp is handled by a separate bearer-token guard in app.ts.
 * - HTML navigation (SPA) -> redirect to /login.
 * - API / WebSocket -> 401 JSON.
 */
export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
	const { SESSION_SECRET } = c.env;

	// Fail closed in production if SESSION_SECRET is missing or the dev placeholder.
	if (!IS_DEV && !validSessionSecret(SESSION_SECRET)) {
		return c.text(
			"Auth is not configured: set SESSION_SECRET via `wrangler secret put SESSION_SECRET`.",
			500,
		);
	}

	const token = getCookie(c, SESSION_COOKIE);
	const user = token && SESSION_SECRET
		? await verifySession(token, SESSION_SECRET)
		: null;

	if (user) {
		c.set("user", user);
		return next();
	}

	const { pathname } = new URL(c.req.url);
	if (pathname.startsWith("/mcp")) return next(); // MCP guard handles it

	if (isPublicPath(pathname)) return next();

	const accept = c.req.header("accept") || "";
	if (accept.includes("text/html")) {
		return c.redirect("/login");
	}
	return c.json({ error: "Unauthorized" }, 401);
});

// -- Auth routes ------------------------------------------------------

const CredentialsSchema = z.object({
	email: z.string().email().max(254),
	password: z.string().min(8).max(200),
});

function parseCredentials(body: unknown) {
	const parsed = CredentialsSchema.safeParse(body);
	if (!parsed.success) {
		const message = parsed.error.issues[0]?.message ?? "Invalid credentials";
		return { error: message };
	}
	return { data: parsed.data };
}

function setSessionCookie(c: Context<AuthEnv>, token: string) {
	const secure = new URL(c.req.url).protocol === "https:";
	setCookie(c, SESSION_COOKIE, token, {
		httpOnly: true,
		sameSite: "Lax",
		secure,
		path: "/",
		maxAge: SESSION_TTL_SECONDS,
	});
}

export const authRoutes = new Hono<AuthEnv>();

authRoutes.post("/register", async (c) => {
	if (!IS_DEV && !validSessionSecret(c.env.SESSION_SECRET)) {
		return c.text("Auth is not configured: set SESSION_SECRET via `wrangler secret put SESSION_SECRET`.", 500);
	}
	const parsed = parseCredentials(await c.req.json().catch(() => null));
	if (!parsed.data) return c.json({ error: parsed.error }, 400);
	const { email, password } = parsed.data;
	const normalized = email.toLowerCase();

	const allowRegistration = String(c.env.ALLOW_REGISTRATION ?? "true") !== "false";
	if (!allowRegistration) {
		return c.json({ error: "Registration is disabled" }, 403);
	}

	const usersStub = c.env.USERS.get(c.env.USERS.idFromName("primary"));
	const existing = await usersStub.getUserByEmail(normalized);
	if (existing) return c.json({ error: "Email already registered" }, 409);

	const passwordHash = await hashPassword(password);
	const id = crypto.randomUUID();
	await usersStub.createUser(id, normalized, passwordHash);

	// Admin accounts automatically own all existing mailboxes.
	const admins = (c.env.ADMIN_EMAILS ?? "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
	if (admins.includes(normalized)) {
		await usersStub.claimAllMailboxes(id);
	}

	const token = await signSession({ id, email: normalized }, c.env.SESSION_SECRET);
	setSessionCookie(c, token);
	return c.json({ user: { id, email: normalized } }, 201);
});

authRoutes.post("/login", async (c) => {
	if (!IS_DEV && !validSessionSecret(c.env.SESSION_SECRET)) {
		return c.text("Auth is not configured: set SESSION_SECRET via `wrangler secret put SESSION_SECRET`.", 500);
	}
	const parsed = parseCredentials(await c.req.json().catch(() => null));
	if (!parsed.data) return c.json({ error: parsed.error }, 400);
	const { email, password } = parsed.data;
	const normalized = email.toLowerCase();

	const usersStub = c.env.USERS.get(c.env.USERS.idFromName("primary"));
	const user = await usersStub.getUserByEmail(normalized);
	if (!user) return c.json({ error: "Invalid email or password" }, 401);

	const ok = await verifyPassword(password, user.password_hash);
	if (!ok) return c.json({ error: "Invalid email or password" }, 401);

	const admins = (c.env.ADMIN_EMAILS ?? "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
	if (admins.includes(normalized)) {
		await usersStub.claimAllMailboxes(user.id);
	}

	const token = await signSession({ id: user.id, email: normalized }, c.env.SESSION_SECRET);
	setSessionCookie(c, token);
	return c.json({ user: { id: user.id, email: normalized } });
});

authRoutes.post("/logout", (c) => {
	deleteCookie(c, SESSION_COOKIE, { path: "/" });
	return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
	const user = c.get("user");
	if (!user) return c.json({ error: "Unauthorized" }, 401);
	return c.json({ user });
});
