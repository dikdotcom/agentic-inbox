// Smoke test for the auth flow. Runs the Hono auth routes + password
// hashing + session JWT against a mocked USERS DO, no server needed.
// Usage: node --experimental-strip-types tests/auth-smoke.mjs
import { authRoutes, hashPassword, verifyPassword, signSession, verifySession } from "../workers/auth.ts";
import { Hono } from "hono";

const results = [];
function check(name, cond) {
	results.push([name, !!cond]);
	console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
}

// --- Password hashing ---
const hash = await hashPassword("s3cret-pass");
check("hashPassword returns pbkdf2 format", hash.startsWith("pbkdf2$100000$"));
check("verify correct password", await verifyPassword("s3cret-pass", hash));
check("reject wrong password", !(await verifyPassword("wrong", hash)));
const hash2 = await hashPassword("s3cret-pass");
check("salt makes hashes unique", hash !== hash2);
check("verify against round-2 hash", await verifyPassword("s3cret-pass", hash2));

// --- Session JWT ---
const secret = "test-secret-0123456789abcdefghijklmnopqrstuvwxyz";
const token = await signSession({ id: "u1", email: "a@b.com" }, secret);
const verified = await verifySession(token, secret);
check("signSession + verifySession roundtrip", verified && verified.id === "u1" && verified.email === "a@b.com");
check("verify rejects wrong secret", !(await verifySession(token, "other-secret-...")));
check("verify rejects garbage", !(await verifySession("garbage.token.here", secret)));

// --- In-memory fake UsersDO similar to UsersDO methods ---
const store = new Map(); // email -> {id,email,password_hash}
const grants = new Map(); // userId -> Set(mailboxId)
const usersStub = {
	async getUserByEmail(email) { return store.get(email.toLowerCase()) ?? null; },
	async getUserById(id) { for (const u of store.values()) if (u.id === id) return u; return null; },
	async createUser(id, email, passwordHash) { const u = { id, email: email.toLowerCase(), password_hash: passwordHash, created_at: new Date().toISOString() }; store.set(u.email, u); grants.set(id, new Set()); return u; },
	async grantMailbox(userId, mailboxId) { (grants.get(userId) ?? new Set()).add(mailboxId.toLowerCase()); },
	async userOwnsMailbox(userId, mailboxId) { return (grants.get(userId) ?? new Set()).has(mailboxId.toLowerCase()); },
	async claimAllMailboxes() { return 0; },
};

const env = {
	SESSION_SECRET: secret,
	ALLOW_REGISTRATION: "true",
	ADMIN_EMAILS: "",
	USERS: { idFromName: () => "primary", get: () => usersStub },
	MCP_TOKEN: undefined,
};

function fullApp() {
	const app = new Hono();
	app.use("*", async (c, next) => {
		// Minimal port of authMiddleware for the public/private split test.
		const { getCookie } = await import("hono/cookie");
		const token = getCookie(c, "session");
		if (token) {
			const u = await verifySession(token, env.SESSION_SECRET);
			if (u) { c.set("user", u); return next(); }
		}
		const path = new URL(c.req.url).pathname;
		if (path === "/login" || path.startsWith("/assets/") || path === "/api/auth/login" || path === "/api/auth/register" || path === "/api/auth/logout") return next();
		if ((c.req.header("accept") || "").includes("text/html")) return c.redirect("/login");
		return c.json({ error: "Unauthorized" }, 401);
	});
	app.route("/api/auth", authRoutes);
	app.get("/api/private", (c) => c.json({ user: c.get("user") }));
	app.get("/", (c) => c.text("spa"));
	return app;
}

const app = fullApp();

// --- Auth endpoints (full app with middleware) ---

// Register
let res = await app.request("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "User@Test.com", password: "password123" }) }, env);
const setCookie = res.headers.get("set-cookie") || "";
check("register returns 201", res.status === 201);
check("register sets session cookie", setCookie.includes("session=") && setCookie.includes("HttpOnly"));
const payload = await res.json();
check("register returns normalized email", payload.user.email === "user@test.com");

// me with cookie
const cookie = setCookie.split(";")[0];
res = await app.request("/api/auth/me", { headers: { cookie } });
check("me with session returns user", res.status === 200 && (await res.json()).user.email === "user@test.com");

// protected endpoint with cookie
res = await app.request("/api/private", { headers: { cookie } });
check("protected API with session -> 200", res.status === 200);

// duplicate register
res = await app.request("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "user@test.com", password: "password123" }) }, env);
check("duplicate register -> 409", res.status === 409);

// login with correct/incorrect
res = await app.request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "user@test.com", password: "password123" }) }, env);
check("login correct -> 200 + cookie", res.status === 200 && res.headers.get("set-cookie")?.includes("session="));
res = await app.request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "user@test.com", password: "wrongpass" }) }, env);
check("login wrong password -> 401", res.status === 401);

// Unauthenticated
res = await app.request("/api/private");
check("protected API no session -> 401", res.status === 401);
res = await app.request("/api/private", { headers: { "accept": "text/html" } });
check("protected page request no session -> redirect /login", res.status === 302 && res.headers.get("location") === "/login");
res = await app.request("/login");
check("login page public (not redirected/auth-blocked)", res.status === 404); // 404 = middleware let it through to routing, no /login route in test app
res = await app.request("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "x@y.com", password: "short" }) }, env);
check("weak password rejected", res.status !== 201);

// logout
res = await app.request("/api/auth/logout", { method: "POST" });
check("logout -> 200", res.status === 200);

// registration disabled
env.ALLOW_REGISTRATION = "false";
res = await app.request("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "new@user.com", password: "password123" }) }, env);
check("register disabled -> 403", res.status === 403);
env.ALLOW_REGISTRATION = "true";

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);