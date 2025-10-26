import "./globals.css"; // ← this line is essential for Tailwind styles

export const metadata = { title: "Kräv" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script src="https://cdn.jsdelivr.net/npm/@mux/mux-player" async></script>
        <script src="https://cdn.jsdelivr.net/npm/@mux/mux-audio" async></script>
      </head>
      <body className="font-sans antialiased bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  );
}
