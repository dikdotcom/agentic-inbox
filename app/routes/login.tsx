import { Button, Input, Text } from "@cloudflare/kumo";
import { EnvelopeIcon } from "@phosphor-icons/react";
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
			const message = (err instanceof Error ? err.message : null) || "Something went wrong";
			setError(message);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="min-h-screen bg-kumo-recessed flex items-center justify-center px-4">
			<div className="w-full max-w-sm">
				<div className="mb-8 flex flex-col items-center text-center">
					<div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-kumo-fill">
						<EnvelopeIcon size={26} weight="duotone" className="text-kumo-default" />
					</div>
					<h1 className="text-xl font-bold text-kumo-default">Agentic Inbox</h1>
					<p className="text-sm text-kumo-subtle mt-1">
						{mode === "login"
							? "Sign in to access your mailboxes"
							: "Create an account to get started"}
					</p>
				</div>

				<form
					onSubmit={handleSubmit}
					className="rounded-xl border border-kumo-line bg-kumo-base p-6 space-y-4"
				>
					{error && (
						<Text variant="error" size="sm">
							{error}
						</Text>
					)}

					<div className="space-y-1.5">
						<span className="text-sm font-medium text-kumo-default block">Email</span>
						<Input
							aria-label="Email"
							type="email"
							placeholder="you@example.com"
							size="sm"
							autoComplete="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
						/>
					</div>

					<div className="space-y-1.5">
						<span className="text-sm font-medium text-kumo-default block">Password</span>
						<Input
							aria-label="Password"
							type="password"
							placeholder="••••••••"
							size="sm"
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
								size="sm"
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
						size="sm"
						className="w-full"
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
						className="w-full text-center text-sm text-kumo-subtle hover:text-kumo-default transition-colors"
					>
						{mode === "login"
							? "No account? Create one"
							: "Already have an account? Sign in"}
					</button>
				</form>
			</div>
		</div>
	);
}
