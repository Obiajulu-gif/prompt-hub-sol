import {
	LayoutGrid,
	Zap,
	Link,
	Users,
	Settings,
	Eye,
	BarChart3,
} from "lucide-react";

interface SidebarProps {
	isOpen: boolean;
	onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
	const navItems = [
		{ icon: <LayoutGrid size={18} />, label: "Tasks", active: true },
		{ icon: <Zap size={18} />, label: "Functions" },
		{ icon: <Link size={18} />, label: "Integrations" },
		{ icon: <Users size={18} />, label: "Users" },
		{ icon: <Settings size={18} />, label: "Settings" },
		{ icon: <Eye size={18} />, label: "Live preview" },
		{ icon: <BarChart3 size={18} />, label: "Performance" },
	];

	return (
		<div
			className={`w-[192px] border-r border-gray-200 h-full flex-shrink-0 bg-white ${
				isOpen ? "block" : "hidden md:block"
			}`}
		>
			<div className="p-4 border-b border-gray-200">
				<h2 className="font-semibold text-lg">GenerativeAgent</h2>
			</div>

			<nav className="py-4">
				<ul className="space-y-1">
					{navItems.map((item, index) => (
						<li key={index}>
							<a
								href="#"
								className={`flex items-center gap-3 px-4 py-2 hover:bg-gray-100 transition-colors ${
									item.active ? "text-blue-600 bg-blue-50" : "text-gray-700"
								}`}
							>
								{item.icon}
								<span className="text-sm">{item.label}</span>
							</a>
						</li>
					))}
				</ul>
			</nav>
		</div>
	);
}
