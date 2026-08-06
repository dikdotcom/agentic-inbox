import { Button, Input, Text } from "@cloudflare/kumo";
import { type FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import api from "~/services/api";

export function meta() {
	return [{ title: "Sign in — Agentic Inbox" }];
}

export default function LoginRoute() {
	const navigate = useNavigate();
	const [mode, setMode] = useState<"login" | "register">("login");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	// Already signed in? Bounce to the app.
	const { data: me } = useQuery({
		queryKey: ["auth", "me"],
		queryFn: () => api.me(),
		retry: false,
	});
	if (me?.user) return <Navigate to="/" replace />;

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);

		if (!email || !password) {
			setError("Email and password are required");
			return;
		}
		if (mode === "register") {
			if (password.length < 8) {
				setError("Password must be at least 8 characters");
				return;
			}
			if (password !== confirm) {
				setError("Passwords do not match");
				return;
			}
		}

		setSubmitting(true);
		try {
			if (mode === "register") {
				await api.register(email, password);
			} else {
				await api.login(email, password);
			}
			navigate("/", { replace: true });
		} catch (err: unknown) {
			const message =
				(err instanceof Error ? err.message : null) || "Something went wrong";
			setError(message);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-kumo-recessed px-6 py-8 overflow-y-auto">
			<div className="w-full max-w-[380px]" style={{ animation: "fadeUp 0.8s cubic-bezier(0.16,1,0.3,1)" }}>
				{/* Brand */}
				<div className="text-center mb-12">
					<div
						className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
						style={{
							background: "linear-gradient(135deg, #c8a44e, #a0833d)",
							boxShadow: "0 8px 32px rgba(200,164,78,0.15)",
						}}
					>
						<svg width="28" height="28" viewBox="0 0 24 24" fill="#09090b">
							<path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-.4 4.25l-6.54 4.09c-.65.41-1.47.41-2.12 0L4.4 8.25a.85.85 0 01.9-1.44L12 11l6.7-4.19a.85.85 0 01.9 1.44z" />
						</svg>
					</div>
					<h1 className="text-[32px] font-extrabold tracking-tight text-kumo-default">
						Agentic Inbox
					</h1>
					<p className="mt-1.5 text-xs uppercase tracking-[2px] text-kumo-inactive">
						Self-Hosted Email
					</p>
				</div>

				{/* Form */}
				<form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
					{error && (
						<Text variant="error" size="sm">
							{error}
						</Text>
					)}

					<div>
						<label className="mb-2 block text-[10px] font-medium uppercase tracking-[1.5px] text-kumo-inactive">
							Email Address
						</label>
						<Input
							aria-label="Email"
							type="email"
							placeholder="you@dika.my.id"
							autoComplete="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							className="w-full !rounded-lg !border-kumo-line !bg-kumo-control !py-3.5 !px-4 !text-sm !font-normal"
						/>
					</div>

					<div>
						<label className="mb-2 block text-[10px] font-medium uppercase tracking-[1.5px] text-kumo-inactive">
							Password
						</label>
						<Input
							aria-label="Password"
							type="password"
							placeholder="Enter your password"
							autoComplete={mode === "login" ? "current-password" : "new-password"}
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							className="w-full !rounded-lg !border-kumo-line !bg-kumo-control !py-3.5 !px-4 !text-sm !font-normal"
						/>
					</div>

					{mode === "register" && (
						<div>
							<label className="mb-2 block text-[10px] font-medium uppercase tracking-[1.5px] text-kumo-inactive">
								Confirm Password
							</label>
							<Input
								aria-label="Confirm password"
								type="password"
								placeholder="Repeat your password"
								autoComplete="new-password"
								value={confirm}
								onChange={(e) => setConfirm(e.target.value)}
								required
								className="w-full !rounded-lg !border-kumo-line !bg-kumo-control !py-3.5 !px-4 !text-sm !font-normal"
							/>
						</div>
					)}

					<Button
						type="submit"
						variant="primary"
						className="w-full !mt-2 !rounded-lg !bg-kumo-brand !text-kumo-recessed !font-bold !tracking-wide hover:!bg-kumo-brand-hover"
						loading={submitting}
					>
						{mode === "login" ? "Sign In" : "Create Account"}
					</Button>
				</form>

				{/* Server tag */}
				<div className="mt-4 flex items-center justify-center gap-2 text-[10px] uppercase tracking-wider text-kumo-inactive">
					<span
						className="h-[5px] w-[5px] rounded-full"
						style={{ background: "#52c07a", boxShadow: "0 0 6px rgba(82,192,122,0.4)" }}
					/>
					<span>Cloudflare Workers · Hono API</span>
				</div>

				{/* Footer */}
				<div className="mt-8 text-center text-[11px] text-kumo-inactive">
					{mode === "login" ? (
						<>
							Secured by Cloudflare Zero Trust
							<br />
							<button
								type="button"
								onClick={() => {
									setMode("register");
									setError(null);
								}}
								className="text-kumo-brand hover:text-kumo-brand-hover cursor-pointer"
							>
								No account? Create one
							</button>
						</>
					) : (
						<button
							type="button"
							onClick={() => {
								setMode("login");
								setError(null);
							}}
							className="text-kumo-brand hover:text-kumo-brand-hover cursor-pointer"
						>
							Already have an account? Sign in
						</button>
					)}
				</div>
			</div>

			<style>{`
				@keyframes fadeUp {
					from { opacity: 0; transform: translateY(24px); }
					to { opacity: 1; transform: translateY(0); }
				}
			`}</style>
		</div>
	);
}
