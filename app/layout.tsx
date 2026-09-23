import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "暗黑世界｜黑暗中世紀掛機 RPG",
  description: "狩獵、鍛造、挑戰首領，在輪迴中奪回失落的世界。",
  openGraph: {
    title: "暗黑世界｜黑暗中世紀掛機 RPG",
    description: "狩獵、鍛造、挑戰首領，在輪迴中奪回失落的世界。",
    type: "website",
    images: ["/logo-dark-world.png"],
  },
  twitter: {
    card: "summary",
    title: "暗黑世界｜黑暗中世紀掛機 RPG",
    description: "狩獵、鍛造、挑戰首領，在輪迴中奪回失落的世界。",
    images: ["/logo-dark-world.png"],
  },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/logo-dark-world.png",
    shortcut: "/logo-dark-world.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
