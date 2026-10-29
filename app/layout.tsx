import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "VaultPath",
  description: "Blockchain investigation workspace that remembers earlier cases with Walrus Memory and checks them against live Sui evidence from Tatum.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#0a1118", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col md:flex-row">
          <aside className="border-b border-line px-4 py-3 md:w-56 md:shrink-0 md:border-b-0 md:border-r md:px-5 md:py-8">
            <div className="mb-3 md:mb-8">
              <p className="font-display text-xl text-text">VaultPath</p>
              <p className="text-xs text-muted">Sui Mainnet case workspace</p>
            </div>
            <Nav />
          </aside>
          <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
