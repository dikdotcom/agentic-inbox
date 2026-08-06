import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { eq, and } from "drizzle-orm";
import * as schema from "./db/schema";
import type { Env } from "./types";

/**
 * UsersDO — single global Durable Object that owns the auth database:
 * users, password hashes, and mailbox ownership grants.
 *
 * One instance ("primary") serves all users; it is not sharded by user
 * because the dataset (accounts + grants) is tiny for a self-hosted app.
 */
export class UsersDO extends DurableObject<Env> {
	private db = drizzle(this.ctx.storage, { schema });

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		// Create the auth tables at construction (idempotent), mirroring
		// MailboxDO. Without this the SQL tables never get created and every
		// query throws -> 500.
		this.ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS users (
				id TEXT PRIMARY KEY,
				email TEXT NOT NULL UNIQUE,
				password_hash TEXT NOT NULL,
				created_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS user_mailboxes (
				user_id TEXT NOT NULL,
				mailbox_id TEXT NOT NULL,
				role TEXT NOT NULL DEFAULT 'owner',
				PRIMARY KEY (user_id, mailbox_id),
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
			);
			CREATE INDEX IF NOT EXISTS idx_user_mailboxes_mailbox ON user_mailboxes(mailbox_id);
		`);
	}

	// -- Users --------------------------------------------------------

	async getUserByEmail(email: string) {
		const row = this.db.select().from(schema.users)
			.where(eq(schema.users.email, email.toLowerCase()))
			.get();
		return row ?? null;
	}

	async getUserById(id: string) {
		const row = this.db.select().from(schema.users)
			.where(eq(schema.users.id, id))
			.get();
		return row ?? null;
	}

	async createUser(id: string, email: string, passwordHash: string) {
		await this.db.insert(schema.users).values({
			id,
			email: email.toLowerCase(),
			password_hash: passwordHash,
			created_at: new Date().toISOString(),
		});
	}

	/** Delete a user and all of their mailbox grants. Returns false if not found. */
	async deleteUserByEmail(email: string): Promise<boolean> {
		const user = await this.db
			.select()
			.from(schema.users)
			.where(eq(schema.users.email, email.toLowerCase()))
			.get();
		if (!user) return false;
		// Delete grants explicitly (SQLite FK cascade is not enforced here).
		await this.db
			.delete(schema.userMailboxes)
			.where(eq(schema.userMailboxes.user_id, user.id))
			.run();
		await this.db.delete(schema.users).where(eq(schema.users.id, user.id)).run();
		return true;
	}

	// -- Mailbox ownership -------------------------------------------

	async grantMailbox(userId: string, mailboxId: string, role: string = "owner") {
		await this.db
			.insert(schema.userMailboxes)
			.values({ user_id: userId, mailbox_id: mailboxId.toLowerCase(), role })
			.onConflictDoNothing();
	}

	async revokeMailbox(userId: string, mailboxId: string) {
		await this.db
			.delete(schema.userMailboxes)
			.where(
				and(
					eq(schema.userMailboxes.user_id, userId),
					eq(schema.userMailboxes.mailbox_id, mailboxId.toLowerCase()),
				),
			);
	}

	async deleteMailboxGrants(mailboxId: string) {
		await this.db
			.delete(schema.userMailboxes)
			.where(eq(schema.userMailboxes.mailbox_id, mailboxId.toLowerCase()));
	}

	async userOwnsMailbox(userId: string, mailboxId: string): Promise<boolean> {
		const row = this.db
			.select({ userId: schema.userMailboxes.user_id })
			.from(schema.userMailboxes)
			.where(
				and(
					eq(schema.userMailboxes.user_id, userId),
					eq(schema.userMailboxes.mailbox_id, mailboxId.toLowerCase()),
				),
			)
			.get();
		return !!row;
	}

	async listUsers(): Promise<{ id: string; email: string; created_at: string }[]> {
		return this.db
			.select({ id: schema.users.id, email: schema.users.email, created_at: schema.users.created_at })
			.from(schema.users)
			.all();
	}

	async resetPassword(email: string, passwordHash: string): Promise<boolean> {
		const user = await this.db
			.select({ id: schema.users.id })
			.from(schema.users)
			.where(eq(schema.users.email, email.toLowerCase()))
			.get();
		if (!user) return false;
		await this.db
			.update(schema.users)
			.set({ password_hash: passwordHash })
			.where(eq(schema.users.id, user.id))
			.run();
		return true;
	}

	async listMailboxesForUser(userId: string): Promise<string[]> {
		const rows = this.db
			.select({ mailboxId: schema.userMailboxes.mailbox_id })
			.from(schema.userMailboxes)
			.where(eq(schema.userMailboxes.user_id, userId))
			.all();
		return rows.map((r) => r.mailboxId);
	}

	/**
	 * Grant the user ownership of every existing mailbox in R2.
	 * Used for admin accounts (ADMIN_EMAILS) so existing mailboxes
	 * created before auth was introduced remain accessible.
	 */
	async claimAllMailboxes(userId: string): Promise<number> {
		const list = await this.env.BUCKET.list({ prefix: "mailboxes/" });
		let granted = 0;
		for (const obj of list.objects) {
			const mailboxId = obj.key.replace("mailboxes/", "").replace(".json", "");
			await this.grantMailbox(userId, mailboxId);
			granted++;
		}
		return granted;
	}
}
