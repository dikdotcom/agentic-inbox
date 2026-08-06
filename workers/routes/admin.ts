// Admin-only API routes (superadmin = email in ADMIN_EMAILS).
// Mounted under /api/v1/admin. All endpoints require a valid session
// whose user email is listed in ADMIN_EMAILS.

import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { hashPassword, validSessionSecret, type AuthEnv } from "../auth";
import type { AuthUser } from "../types";
import { listMailboxes } from "../lib/email-helpers";
import type { Env } from "../types";

export const adminRoutes = new Hono<AuthEnv>();

function isAdminEmail(email: string, env: Env): boolean {
	return (env.ADMIN_EMAILS || "")
		.split(",")
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean)
		.includes(email.toLowerCase());
}

async function requireAdmin(c: Context<AuthEnv>): Promise<AuthUser | null> {
	if (!validSessionSecret(c.env.SESSION_SECRET)) return null;
	const user = c.get("user");
	if (!user || !isAdminEmail(user.email, c.env)) return null;
	return user;
}

function usersStub(env: Env) {
	return env.USERS.get(env.USERS.idFromName("primary"));
}

const UserBody = z.object({
	email: z.string().email().max(254),
	password: z.string().min(8).max(200),
});

const MailboxBody = z.object({
	email: z.string().email(),
	name: z.string().min(1).max(120).optional(),
	ownerEmail: z.string().email().optional(),
	settings: z.record(z.any()).optional(),
});

const AssignBody = z.object({ email: z.string().email() });

// -- Users ----------------------------------------------------------

adminRoutes.get("/users", async (c) => {
	if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);
	const stub = usersStub(c.env);
	const users = await stub.listUsers();
	const enriched = await Promise.all(
		users.map(async (u) => ({
			...u,
			isAdmin: isAdminEmail(u.email, c.env),
			mailboxes: await stub.listMailboxesForUser(u.id),
		})),
	);
	return c.json({ users: enriched });
});

adminRoutes.post("/users", async (c) => {
	if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);
	const parsed = UserBody.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid email or password" }, 400);
	const { email, password } = parsed.data;
	const normalized = email.toLowerCase();
	const stub = usersStub(c.env);
	if (await stub.getUserByEmail(normalized)) {
		return c.json({ error: "User already exists" }, 409);
	}
	const id = crypto.randomUUID();
	await stub.createUser(id, normalized, await hashPassword(password));
	return c.json({ user: { id, email: normalized } }, 201);
});

adminRoutes.post("/users/reset-password", async (c) => {
	if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);
	const parsed = UserBody.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid email or password" }, 400);
	const { email, password } = parsed.data;
	const stub = usersStub(c.env);
	const ok = await stub.resetPassword(email, await hashPassword(password));
	return ok
		? c.json({ ok: true })
		: c.json({ error: "User not found" }, 404);
});

adminRoutes.delete("/users", async (c) => {
	if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);
	const body = await c.req.json().catch(() => ({}));
	const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
	if (!email) return c.json({ error: "email is required" }, 400);
	const stub = usersStub(c.env);
	const deleted = await stub.deleteUserByEmail(email);
	return deleted ? c.json({ ok: true }) : c.json({ error: "User not found" }, 404);
});

// -- Mailboxes ------------------------------------------------------

adminRoutes.get("/mailboxes", async (c) => {
	if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);
	const stub = usersStub(c.env);
	const users = await stub.listUsers();
	const all = await listMailboxes(c.env.BUCKET);
	const withOwners = await Promise.all(
		all.map(async (m) => {
			const owners = await Promise.all(
				users.map(async (u) =>
					(await stub.listMailboxesForUser(u.id)).includes(m.id) ? u.email : null,
				),
			);
			const obj = await c.env.BUCKET.get(`mailboxes/${m.id}.json`);
			const settings = obj ? ((await obj.json()) as Record<string, unknown>) : {};
			return {
				id: m.id,
				settings,
				owners: owners.filter((e): e is string => e !== null),
			};
		}),
	);
	return c.json({ mailboxes: withOwners });
});

adminRoutes.post("/mailboxes", async (c) => {
	if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);
	const parsed = MailboxBody.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid request" }, 400);
	const { email, ownerEmail } = parsed.data;
	const normalized = email.toLowerCase();
	const key = `mailboxes/${normalized}.json`;
	if (await c.env.BUCKET.head(key)) {
		return c.json({ error: "Mailbox already exists" }, 409);
	}
	const defaultSettings = {
		fromName: parsed.data.name || normalized.split("@")[0],
		forwarding: { enabled: false, email: "" },
		signature: { enabled: false, text: "" },
		autoReply: { enabled: false, subject: "", message: "" },
	};
	const finalSettings = { ...defaultSettings, ...(parsed.data.settings || {}) };
	await c.env.BUCKET.put(key, JSON.stringify(finalSettings));
	const mailboxStub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(normalized));
	await mailboxStub.getFolders(); // ensure DO exists
	const stub = usersStub(c.env);
	if (ownerEmail) {
		const owner = await stub.getUserByEmail(ownerEmail.toLowerCase());
		if (owner) await stub.grantMailbox(owner.id, normalized, "owner");
	}
	return c.json({ id: normalized, email: normalized, settings: finalSettings }, 201);
});

adminRoutes.put("/mailboxes/:id", async (c) => {
	if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);
	const mailboxId = c.req.param("id")!.toLowerCase();
	const { settings } = (await c.req.json()) as { settings?: Record<string, unknown> };
	if (!settings || typeof settings !== "object") {
		return c.json({ error: "settings is required" }, 400);
	}
	const key = `mailboxes/${mailboxId}.json`;
	if (!(await c.env.BUCKET.head(key))) return c.json({ error: "Not found" }, 404);
	await c.env.BUCKET.put(key, JSON.stringify(settings));
	return c.json({ id: mailboxId, settings });
});

adminRoutes.post("/mailboxes/:id/assign", async (c) => {
	if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);
	const mailboxId = c.req.param("id")!.toLowerCase();
	const parsed = AssignBody.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "email is required" }, 400);
	const stub = usersStub(c.env);
	const user = await stub.getUserByEmail(parsed.data.email.toLowerCase());
	if (!user) return c.json({ error: "User not found" }, 404);
	const key = `mailboxes/${mailboxId}.json`;
	if (!(await c.env.BUCKET.head(key))) return c.json({ error: "Mailbox not found" }, 404);
	await stub.grantMailbox(user.id, mailboxId, "owner");
	return c.json({ ok: true });
});

adminRoutes.delete("/mailboxes/:id/assign/:userEmail", async (c) => {
	if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);
	const mailboxId = c.req.param("id")!.toLowerCase();
	const userEmail = c.req.param("userEmail")!.toLowerCase();
	const stub = usersStub(c.env);
	const user = await stub.getUserByEmail(userEmail);
	if (!user) return c.json({ error: "User not found" }, 404);
	await stub.revokeMailbox(user.id, mailboxId);
	return c.json({ ok: true });
});

adminRoutes.delete("/mailboxes/:id", async (c) => {
	if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);
	const mailboxId = c.req.param("id")!.toLowerCase();
	const key = `mailboxes/${mailboxId}.json`;
	if (!(await c.env.BUCKET.head(key))) return c.json({ error: "Not found" }, 404);
	await c.env.BUCKET.delete(key);
	const stub = usersStub(c.env);
	await stub.deleteMailboxGrants(mailboxId);
	return c.body(null, 204);
});
