"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ConversationDetailsProps {
	isOpen: boolean;
	activeTab: "actions" | "customer" | "settings";
	onTabChange: (tab: "actions" | "customer" | "settings") => void;
	customerName: string;
	onClose: () => void;
}

export function ConversationDetails({
	isOpen,
	activeTab,
	onTabChange,
	customerName,
	onClose,
}: ConversationDetailsProps) {
	if (!isOpen) return null;

	return (
		<div className="w-[280px] border-l border-gray-200 h-full flex-shrink-0 bg-white">
			<div className="p-4 border-b border-gray-200">
				<div className="flex justify-between items-center">
					<h2 className="font-semibold">Conversation details</h2>
					<Button
						variant="ghost"
						size="icon"
						onClick={onClose}
						className="hover:bg-red-50 hover:text-red-500 transition-colors"
					>
						<X size={18} />
					</Button>
				</div>
			</div>

			<Tabs
				value={activeTab}
				onValueChange={(value) => onTabChange(value as any)}
			>
				<TabsList className="w-full grid grid-cols-3">
					<TabsTrigger value="actions">Actions</TabsTrigger>
					<TabsTrigger value="customer">Customer</TabsTrigger>
					<TabsTrigger value="settings">Settings</TabsTrigger>
				</TabsList>

				<TabsContent value="actions" className="p-4">
					<div className="space-y-4">
						<div className="space-y-2">
							<h3 className="font-medium text-sm">Quick actions</h3>
							<div className="space-y-2">
								<Button
									variant="outline"
									size="sm"
									className="w-full justify-start transition-colors hover:bg-blue-50 hover:text-blue-600"
								>
									Check account status
								</Button>
								<Button
									variant="outline"
									size="sm"
									className="w-full justify-start transition-colors hover:bg-blue-50 hover:text-blue-600"
								>
									Process payment
								</Button>
								<Button
									variant="outline"
									size="sm"
									className="w-full justify-start transition-colors hover:bg-blue-50 hover:text-blue-600"
								>
									Update customer info
								</Button>
								<Button
									variant="outline"
									size="sm"
									className="w-full justify-start transition-colors hover:bg-blue-50 hover:text-blue-600"
								>
									Create support ticket
								</Button>
							</div>
						</div>

						<div className="space-y-2">
							<h3 className="font-medium text-sm">Suggested responses</h3>
							<div className="space-y-2">
								<Button
									variant="outline"
									size="sm"
									className="w-full justify-start text-left transition-colors hover:bg-blue-50 hover:text-blue-600"
								>
									I'll check your account right away.
								</Button>
								<Button
									variant="outline"
									size="sm"
									className="w-full justify-start text-left transition-colors hover:bg-blue-50 hover:text-blue-600"
								>
									Would you like to set up automatic payments?
								</Button>
								<Button
									variant="outline"
									size="sm"
									className="w-full justify-start text-left transition-colors hover:bg-blue-50 hover:text-blue-600"
								>
									Is there anything else I can help with today?
								</Button>
							</div>
						</div>
					</div>
				</TabsContent>

				<TabsContent value="customer" className="p-4">
					<div className="space-y-4">
						<div className="space-y-2">
							<h3 className="font-medium text-sm">Customer information</h3>
							<div className="space-y-1 text-sm">
								<p>
									<span className="font-medium">Name:</span> {customerName}
								</p>
								<p>
									<span className="font-medium">Email:</span>{" "}
									customer@example.com
								</p>
								<p>
									<span className="font-medium">Phone:</span> (555) 123-4567
								</p>
								<p>
									<span className="font-medium">Account:</span> #12345678
								</p>
								<p>
									<span className="font-medium">Status:</span>{" "}
									<span className="text-green-600">Active</span>
								</p>
							</div>
						</div>

						<div className="space-y-2">
							<h3 className="font-medium text-sm">Recent activity</h3>
							<div className="space-y-2 text-sm">
								<div className="p-2 border border-gray-200 rounded-md hover:border-blue-300 transition-colors">
									<p className="font-medium">Payment received</p>
									<p className="text-gray-500 text-xs">July 15, 2024</p>
								</div>
								<div className="p-2 border border-gray-200 rounded-md hover:border-blue-300 transition-colors">
									<p className="font-medium">Support ticket #45678</p>
									<p className="text-gray-500 text-xs">June 28, 2024</p>
								</div>
								<div className="p-2 border border-gray-200 rounded-md hover:border-blue-300 transition-colors">
									<p className="font-medium">Account updated</p>
									<p className="text-gray-500 text-xs">June 10, 2024</p>
								</div>
							</div>
						</div>
					</div>
				</TabsContent>

				<TabsContent value="settings" className="p-4">
					<div className="space-y-4">
						<div className="space-y-2">
							<h3 className="font-medium text-sm">Chat settings</h3>
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<span className="text-sm">Auto-translate</span>
									<div className="relative inline-block w-10 h-5 rounded-full bg-gray-200">
										<input
											type="checkbox"
											className="sr-only peer"
											id="auto-translate"
										/>
										<label
											htmlFor="auto-translate"
											className="absolute inset-0 rounded-full cursor-pointer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-all peer-checked:after:translate-x-5"
										></label>
									</div>
								</div>

								<div className="flex items-center justify-between">
									<span className="text-sm">Save chat history</span>
									<div className="relative inline-block w-10 h-5 rounded-full bg-gray-200">
										<input
											type="checkbox"
											className="sr-only peer"
											id="save-history"
											defaultChecked
										/>
										<label
											htmlFor="save-history"
											className="absolute inset-0 rounded-full cursor-pointer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-all peer-checked:after:translate-x-5"
										></label>
									</div>
								</div>

								<div className="flex items-center justify-between">
									<span className="text-sm">Enable voice</span>
									<div className="relative inline-block w-10 h-5 rounded-full bg-gray-200">
										<input
											type="checkbox"
											className="sr-only peer"
											id="enable-voice"
											defaultChecked
										/>
										<label
											htmlFor="enable-voice"
											className="absolute inset-0 rounded-full cursor-pointer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-all peer-checked:after:translate-x-5"
										></label>
									</div>
								</div>
							</div>
						</div>

						<div className="space-y-2">
							<h3 className="font-medium text-sm">Agent settings</h3>
							<div className="space-y-2">
								<div>
									<label className="text-sm block mb-1">Response style</label>
									<select className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
										<option>Professional</option>
										<option>Friendly</option>
										<option>Concise</option>
										<option>Detailed</option>
									</select>
								</div>

								<div>
									<label className="text-sm block mb-1">Knowledge base</label>
									<select className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
										<option>Customer Support</option>
										<option>Technical Support</option>
										<option>Billing</option>
										<option>Sales</option>
									</select>
								</div>
							</div>
						</div>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
