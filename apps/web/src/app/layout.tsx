import type { Metadata } from "next";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { db } from "@agent-office/domain/services";
import { Providers } from "./providers";
import "./globals.css";

const ubuntu = localFont({
  src: "../fonts/Ubuntu.ttf",
  variable: "--font-sans",
  display: "swap",
});

const ubuntuMono = localFont({
  src: "../fonts/UbuntuSansMono.ttf",
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Agent Office",
  description: "Personal fleet manager for Claude Code subagents.",
};

/**
 * Tauri packages the app as a running Node server, not as a static export.
 * Force dynamic rendering everywhere so Next.js does NOT try to prerender
 * pages at build time — which crashes because the pages-router fallback
 * `/404` chunk imports `<Html>` from `next/document`.
 */
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  // Read the stored theme server-side so the correct value is embedded in the
  // initial HTML, avoiding any client-side flash before React hydrates.
  const storedTheme = db.getUiSetting("theme");
  const initialTheme = storedTheme === "dark" || storedTheme === "light" ? storedTheme : "dark";

  return (
    <html lang={locale} data-theme={initialTheme} className={`${ubuntu.variable} ${ubuntuMono.variable}`}>
      <head>
        <style>{`button:not(:disabled){cursor:pointer}button:disabled{cursor:not-allowed}`}</style>
        {/* Synchronous Tauri detection — runs before CSS is applied so there's no
            flash. Adds .tauri to <html> which triggers transparent-body rules. */}
        <script dangerouslySetInnerHTML={{ __html: `if('__TAURI_INTERNALS__' in window)document.documentElement.classList.add('tauri')` }} />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
