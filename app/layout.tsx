import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VOIDGPT · Astra",
  description:
    "A local-first, ChatGPT-style web app deployable on Vercel with Sign in with ChatGPT.",
  icons: {
    icon: "/assets/images/logo.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/assets/images/logo.svg" type="image/svg+xml" sizes="any" />
      </head>
      <body data-theme="dark" data-font="system" data-fontsize="medium">
        {children}
      </body>
    </html>
  );
}
