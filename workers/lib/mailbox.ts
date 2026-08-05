/**
 * Hono middleware to handle repetitive Mailbox Durable Object instantiation.
 * Checks that the caller owns the mailbox (auth), verifies it exists in R2,
 * then instantiates the DO stub and attaches it to the Hono context (`c.var.mailboxStub`).
 */
import { createMiddleware } from "hono/factory";
import type { MailboxDO } from "../durableObject";
import type { Env, AuthUser } from "../types";

export type MailboxContext = {
	Bindings: Env;
	Variables: {
		user: AuthUser;
		mailboxStub: DurableObjectStub<MailboxDO>;
	};
};

export const requireMailbox = createMiddleware<MailboxContext>(async (c, next) => {
	const rawId = c.req.param("mailboxId");
	if (!rawId) return c.json({ error: "Mailbox ID required" }, 400);
	const mailboxId = decodeURIComponent(rawId);

	// Verify the authenticated user owns this mailbox
	const usersStub = c.env.USERS.get(c.env.USERS.idFromName("primary"));
	const owns = await usersStub.userOwnsMailbox(c.var.user.id, mailboxId);
	if (!owns) {
		return c.json({ error: "Forbidden: you do not have access to this mailbox" }, 403);
	}

	// Verify mailbox exists
	const key = `mailboxes/${mailboxId}.json`;
	const obj = await c.env.BUCKET.head(key);
	if (!obj) {
		return c.json({ error: "Not found" }, 404);
	}

	// Instantiate DO stub
	const ns = c.env.MAILBOX;
	const id = ns.idFromName(mailboxId);
	const stub = ns.get(id);

	c.set("mailboxStub", stub);
	
	await next();
});
