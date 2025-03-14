"use client";

import { useEffect, useState } from "react";
import { Users, Code, ImageIcon, Zap } from "lucide-react";

// Easing function (corrected placement)
const easeInOutCubic = (t: number) =>
	t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export default function StatsCounter() {
	const [counts, setCounts] = useState({
		users: 0,
		prompts: 0,
		images: 0,
		transactions: 0,
	});

	const targets = {
		users: 25000,
		prompts: 100000,
		images: 5000000,
		transactions: 250000,
	};

	useEffect(() => {
		const duration = 2000; // 2 seconds animation
		const steps = 60;
		const interval = duration / steps;

		let step = 0;

		const timer = setInterval(() => {
			step++;

			const progress = easeInOutCubic(step / steps); // ✅ Use function directly

			setCounts({
				users: Math.floor(progress * targets.users),
				prompts: Math.floor(progress * targets.prompts),
				images: Math.floor(progress * targets.images),
				transactions: Math.floor(progress * targets.transactions),
			});

			if (step >= steps) {
				clearInterval(timer);
			}
		}, interval);

		return () => clearInterval(timer);
	}, []);

	return (
		<section className="py-12 bg-black">
			<div className="container">
				<div className="grid grid-cols-2 md:grid-cols-4 gap-6">
					<StatCard
						icon={<Users className="size-6 text-purple-400" />}
						value={counts.users}
						label="Active Users"
						color="purple"
					/>
					<StatCard
						icon={<Code className="size-6 text-blue-400" />}
						value={counts.prompts}
						label="AI Prompts"
						color="blue"
					/>
					<StatCard
						icon={<ImageIcon className="size-6 text-pink-400" />}
						value={counts.images}
						label="Generated Images"
						color="pink"
					/>
					<StatCard
						icon={<Zap className="size-6 text-green-400" />}
						value={counts.transactions}
						label="Transactions"
						color="green"
					/>
				</div>
			</div>
		</section>
	);
}

function StatCard({
	icon,
	value,
	label,
	color,
}: {
	icon: React.ReactNode;
	value: number;
	label: string;
	color: string;
}) {
	return (
		<div className="flex flex-col items-center text-center">
			<div
				className={`size-12 rounded-full bg-${color}-900/30 flex items-center justify-center mb-4`}
			>
				{icon}
			</div>
			<div className="text-2xl md:text-3xl font-bold mb-1">
				{value.toLocaleString()}+
			</div>
			<p className="text-sm text-gray-400">{label}</p>
		</div>
	);
}
