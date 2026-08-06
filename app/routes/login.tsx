import { Button, Input, Text } from "@cloudflare/kumo";
import {
	EnvelopeIcon,
	LightningIcon,
	LockKeyIcon,
	RobotIcon,
	ShieldCheckIcon,
} from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import api from "~/services/api";

export function meta() {
	return [{ title: "Sign in — Agentic Inbox" }];
}

const FEATURES = [
	{
		icon: RobotIcon,
		title: "AI agent for your mail",
		text: "Draft, summarize and triage emails with a built-in agent — right from your inbox.",
	},
	{
		icon: LockKeyIcon,
		title: "Private by default",
		text: "Self-hosted on your own Cloudflare account. Your mail never touches third-party servers.",
	},
	{
		icon: LightningIcon,
		title: "Fast, modern, responsive",
		text: "A clean three-pane experience that adapts to any screen — phone to desktop.",
	},
];

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
		<div className="min-h-screen lg:grid lg:grid-cols-[1.1fr_1fr] bg-kumo-recessed">
			{/* Branding panel (desktop left / mobile top) */}
			<div className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-kumo-brand via-kumo-brand-hover to-kumo-recessed p-8 lg:p-14">
				{/* Decorative glow */}
				<div
					aria-hidden
					className="pointer-events-none absolute inset-0"
					style={{
						background:
							"radial-gradient(700px circle at 15% 20%, rgba(255,255,255,0.16), transparent 55%), radial-gradient(500px circle at 90% 90%, rgba(0,0,0,0.25), transparent 60%)",
					}}
				/>

				<div className="relative flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
						<EnvelopeIcon size={22} weight="fill" className="text-white" />
					</div>
					<span className="text-lg font-bold tracking-tight text-white">
						Agentic Inbox
					</span>
				</div>

				<div className="relative my-10 lg:my-0">
					<h1 className="max-w-md text-3xl font-bold leading-tight tracking-tight text-white lg:text-[2.6rem]">
						Email, handled — by you and your agent.
					</h1>
					<p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/75">
						Your mailboxes, your domain, your data. Sign in to pick up where
						you left off.
					</p>

					<ul className="mt-10 hidden space-y-5 lg:block">
						{FEATURES.map((f) => (
							<li key={f.title} className="flex gap-4">
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/12 backdrop-blur">
									<f.icon size={20} className="text-white" />
								</div>
								<div>
									<p className="text-sm font-semibold text-white">{f.title}</p>
									<p className="mt-0.5 max-w-sm text-sm leading-relaxed text-white/65">
										{f.text}
									</p>
								</div>
							</li>
						))}
					</ul>
				</div>

				<p className="relative flex items-center gap-1.5 text-xs text-white/55">
					<ShieldCheckIcon size={13} />
					Self-hosted on Cloudflare — your mail stays yours
				</p>
			</div>

			{/* Form panel */}
			<div className="flex items-center justify-center bg-kumo-recessed px-4 py-12 lg:px-10">
				<div className="w-full max-w-sm">
					<div className="mb-8 lg:hidden">
						<div className="flex items-center gap-2.5">
							<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-kumo-brand to-kumo-brand-hover">
								<EnvelopeIcon size={18} weight="fill" className="text-white" />
							</div>
							<span className="text-base font-bold tracking-tight text-kumo-default">
								Agentic Inbox
							</span>
						</div>
					</div>

					<h2 className="text-2xl font-bold tracking-tight text-kumo-default">
						{mode === "login" ? "Welcome back" : "Create your account"}
					</h2>
					<p className="mt-1.5 text-sm text-kumo-subtle">
						{mode === "login"
							? "Sign in to access your mailboxes"
							: "Set up your account to get started"}
					</p>

					<form onSubmit={handleSubmit} className="mt-8 space-y-5">
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
			</div>
		</div>
	);
}
