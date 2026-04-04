import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crawford Coaching — Mailer",
  description: "Private mailing tool",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Jost:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-ink text-pale font-sans antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
