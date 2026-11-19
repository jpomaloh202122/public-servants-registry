import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Government of PNG Public Servants Registry System",
  description: "Private employee registry and public service reporting.",
  icons: {
    icon: "/png-state-emblem.jpg",
    shortcut: "/png-state-emblem.jpg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
