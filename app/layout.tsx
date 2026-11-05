import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Public Servant Registry | Government Payroll Office",
  description: "Private employee registry and public service reporting.",
  icons: {
    icon: "/gpo-icon.png",
    shortcut: "/gpo-icon.png",
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
