import { Button, Input, Text } from "@cloudflare/kumo";
import { EnvelopeIcon, ShieldCheckIcon } from "@phosphor-icons/react";
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
		<div className="relative min-h-screen flex items-center justify-center overflow-hidden px-4 bg-kumo-recessed">
			{/* Ambient background glow */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0"
				style={{
					background:
						"radial-gradient(600px circle at 50% -10%, color-mix(in oklab, var(--color-kumo-brand) 14%, transparent), transparent 60%), radial-gradient(500px circle at 85% 110%, color-mix(in oklab, var(--color-kumo-brand) 8%, transparent), transparent 60%)",
				}}
			/>

			<div className="relative w-full max-w-[400px]">
				{/* Brand */}
				<div className="mb-8 flex flex-col items-center text-center">
					<div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-kumo-brand to-kumo-brand-hover shadow-lg shadow-kumo-brand/25">
						<EnvelopeIcon size={28} weight="fill" className="text-white" />
					</div>
					<h1 className="text-2xl font-bold tracking-tight text-kumo-default">
						Agentic Inbox
					</h1>
					<p className="text-sm text-kumo-subtle mt-1.5">
						{mode === "login"
							? "Sign in to your mailboxes"
							: "Create your account to get started"}
					</p>
				</div>

				{/* Card */}
				<div className="rounded-2xl border border-kumo-line bg-kumo-control shadow-xl shadow-black/20 p-8">
					<form onSubmit={handleSubmit} className="space-y-5">
						{error && (
							<Text variant="error" size="sm">
								{error}
							</Text>
						)}

						<div className="space-y-1.5">
							<span className="text-sm font-medium text-kumo-default block">
								Email
							</span>
							<Input
								aria-label="Email"
								type="email"
								placeholder="you@example.com"
								autoComplete="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
							/>
						</div>

						<div className="space-y-1.5">
							<span className="text-sm font-medium text-kumo-default block">
								Password
							</span>
							<Input
								aria-label="Password"
								type="password"
								placeholder="••••••••"
								autoComplete={mode === "login" ? "current-password" : "new-password"}
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
							/>
						</div>

						{mode === "register" && (
							<div className="space-y-1.5">
								<span className="text-sm font-medium text-kumo-default block">
									Confirm Password
								</span>
								<Input
									aria-label="Confirm password"
									type="password"
									placeholder="••••••••"
									autoComplete="new-password"
									value={confirm}
									onChange={(e) => setConfirm(e.target.value)}
									required
								/>
							</div>
						)}

						<Button
							type="submit"
							variant="primary"
							className="w-full !h-10 text-[15px]"
							loading={submitting}
						>
							{mode === "login" ? "Sign In" : "Create Account"}
						</Button>

						<button
							type="button"
							onClick={() => {
								setMode(mode === "login" ? "register" : "login");
								setError(null);
							}}
							className="w-full text-center text-sm text-kumo-subtle hover:text-kumo-default transition-colors cursor-pointer"
						>
							{mode === "login"
								? "No account? Create one"
								: "Already have an account? Sign in"}
						</button>
					</form>
				</div>

				{/* Footer */}
				<p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-kumo-subtle">
					<ShieldCheckIcon size={13} />
					Self-hosted on Cloudflare — your mail stays yours
				</p>
			</div>
		</div>
	);
}
