import "./globals.css"; // ← this line is essential for Tailwind styles
import Script from "next/script";

export const metadata = { title: "Kräv" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://unpkg.com/@mux/mux-player@2.10.0"
          strategy="beforeInteractive"
        />
        <Script
          src="https://unpkg.com/@mux/mux-audio@0.8.0"
          strategy="beforeInteractive"
        />
      </head>
      <body className="font-sans antialiased bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  );
}
