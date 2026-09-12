import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resse.ai — backend runtime",
  description: "The agent backend the Resse.ai Expo kiosk app connects to.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Spline+Sans+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
