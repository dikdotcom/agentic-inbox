import { type PointerEvent, type ReactNode, useRef, useState } from "react";

interface SwipeableEmailRowProps {
	children: ReactNode;
	/** Revealed when swiped RIGHT (e.g. Reply) */
	leftActions?: ReactNode;
	/** Revealed when swiped LEFT (e.g. Archive + Delete) */
	rightActions?: ReactNode;
	onOpen?: () => void;
	onKeyDown?: (e: React.KeyboardEvent) => void;
	className?: string;
}

const OPEN_OFFSET = 152;

/**
 * Gmail-style swipeable row: drag left reveals right-side actions,
 * drag right reveals left-side actions. Tap while open closes it.
 */
export default function SwipeableEmailRow({
	children,
	leftActions,
	rightActions,
	onOpen,
	onKeyDown,
	className = "",
}: SwipeableEmailRowProps) {
	const [offset, setOffset] = useState(0);
	const [openSide, setOpenSide] = useState<"left" | "right" | null>(null);
	const startX = useRef(0);
	const dragging = useRef(false);
	const suppressedClick = useRef(false);

	const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
		if (e.pointerType === "mouse" && e.button !== 0) return;
		startX.current = e.clientX;
		dragging.current = true;
		suppressedClick.current = false;
		e.currentTarget.setPointerCapture(e.pointerId);
	};

	const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
		if (!dragging.current) return;
		const dx = e.clientX - startX.current;
		const base =
			openSide === "right" ? -OPEN_OFFSET : openSide === "left" ? OPEN_OFFSET : 0;
		const next = base + dx;
		setOffset(Math.max(-OPEN_OFFSET - 8, Math.min(OPEN_OFFSET + 8, next)));
		if (Math.abs(dx) > 8) suppressedClick.current = true;
	};

	const handlePointerUp = () => {
		if (!dragging.current) return;
		dragging.current = false;
		const side: "left" | "right" | null =
			offset < -OPEN_OFFSET / 2 ? "right" : offset > OPEN_OFFSET / 2 ? "left" : null;
		setOpenSide(side);
		setOffset(side === "right" ? -OPEN_OFFSET : side === "left" ? OPEN_OFFSET : 0);
	};

	const handleClick = () => {
		if (suppressedClick.current) {
			suppressedClick.current = false;
			return;
		}
		if (openSide) {
			setOpenSide(null);
			setOffset(0);
			return;
		}
		onOpen?.();
	};

	return (
		<div
			className={"relative overflow-hidden " + className}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
			onClick={handleClick}
			onKeyDown={onKeyDown}
			role="button"
			tabIndex={0}
		>
			{/* Back actions: right side (swipe left reveals these) */}
			{rightActions && (
				<div
					className="absolute inset-y-0 right-0 flex"
					style={{ width: OPEN_OFFSET }}
				>
					{rightActions}
				</div>
			)}
			{/* Back actions: left side (swipe right reveals these) */}
			{leftActions && (
				<div
					className="absolute inset-y-0 left-0 flex"
					style={{ width: OPEN_OFFSET }}
				>
					{leftActions}
				</div>
			)}

			{/* Foreground row */}
			<div
				className="relative z-10"
				style={{
					transform: `translateX(${offset}px)`,
					transition: dragging.current
						? "none"
						: "transform 0.2s cubic-bezier(0.16,1,0.3,1)",
					touchAction: "pan-y",
				}}
			>
				{children}
			</div>
		</div>
	);
}
