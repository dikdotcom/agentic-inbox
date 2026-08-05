import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

export const folders = sqliteTable("folders", {
	id: text("id").primaryKey(),
	name: text("name").notNull().unique(),
	is_deletable: integer("is_deletable").notNull().default(1),
});

export const emails = sqliteTable("emails", {
	id: text("id").primaryKey(),
	folder_id: text("folder_id")
		.notNull()
		.references(() => folders.id, { onDelete: "cascade" }),
	subject: text("subject"),
	sender: text("sender"),
	recipient: text("recipient"),
	cc: text("cc"),
	bcc: text("bcc"),
	date: text("date"),
	read: integer("read").default(0),
	starred: integer("starred").default(0),
	body: text("body"),
	in_reply_to: text("in_reply_to"),
	email_references: text("email_references"),
	thread_id: text("thread_id"),
	message_id: text("message_id"),
	raw_headers: text("raw_headers"),
});

export const attachments = sqliteTable("attachments", {
	id: text("id").primaryKey(),
	email_id: text("email_id")
		.notNull()
		.references(() => emails.id, { onDelete: "cascade" }),
	filename: text("filename").notNull(),
	mimetype: text("mimetype").notNull(),
	size: integer("size").notNull(),
	content_id: text("content_id"),
	disposition: text("disposition"),
});

// -- Auth (stored in UsersDO, not MailboxDO) -------------------------

export const users = sqliteTable("users", {
	id: text("id").primaryKey(),
	email: text("email").notNull().unique(),
	password_hash: text("password_hash").notNull(),
	created_at: text("created_at").notNull(),
});

export const userMailboxes = sqliteTable(
	"user_mailboxes",
	{
		user_id: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		mailbox_id: text("mailbox_id").notNull(),
		role: text("role").notNull().default("owner"),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.user_id, t.mailbox_id] }),
	}),
);
