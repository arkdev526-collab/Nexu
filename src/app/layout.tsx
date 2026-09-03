import "./globals.css";

/**
 * Root shell only. Site chrome lives in the route-group layouts:
 * `(nexu)` for the Nexu Apps site, `mintedup` for the Minted Up marketplace.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
