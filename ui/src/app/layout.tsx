import type { Metadata } from "next";
import "./globals.css";
import { ServerProvider } from "@/contexts/ServerContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ViewModeProvider } from "@/contexts/ViewModeContext";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "Hourglass",
  description: "AI agent orchestration platform",
  icons: {
    icon: [
      { url: "/hourglass.svg", type: "image/svg+xml" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ServerProvider>
          <ThemeProvider>
            <ViewModeProvider>
              <AppShell>{children}</AppShell>
            </ViewModeProvider>
          </ThemeProvider>
        </ServerProvider>
      </body>
    </html>
  );
}
