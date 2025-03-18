import './globals.css'
import { ClusterProvider } from '@/components/cluster/cluster-data-access'
import { SolanaProvider } from '@/components/solana/solana-provider'
import { ReactQueryProvider } from './react-query-provider'
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Prompt Hub",
	description:
		"Explore the best prompts from top creators. Generate images, text & code with ease.",
	themeColor: "#ffffff",
	icons: "/images/logo.png",
	openGraph: {
		title: "Prompt Hub",
		description:
			"Explore a curated collection of top creator prompts for images, text & code generation.",
		url: "https://prompthub.example.com",
		siteName: "Prompt Hub",
		locale: "en_US",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		site: "@prompthub",
		creator: "@prompthub",
	},
};




export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<body>
				<ReactQueryProvider>
					<ClusterProvider>
						<SolanaProvider>
							<div>{children}</div>
						</SolanaProvider>
					</ClusterProvider>
				</ReactQueryProvider>
			</body>
		</html>
	);
}


