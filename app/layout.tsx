import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Mulish, Pixelify_Sans, VT323 } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast";
import { KonamiFishing } from "@/components/site/KonamiFishing";
import { getNavState } from "@/components/site/nav-data";
import { RouteTransition } from "@/components/site/RouteTransition";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import "./globals.css";

// Site type: Pixelify Sans (headings, buttons), Mulish (body). VT323 is Dive's HUD font.
const pixelify = Pixelify_Sans({ variable: "--font-pixelify", subsets: ["latin"] });
const mulish = Mulish({ variable: "--font-mulish", subsets: ["latin"] });
const vt323 = VT323({ variable: "--font-vt323", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "SYLLABYSS",
  description: "Turn your notes into games. Rarer answers sink deeper.",
};

// The site shell (F19 #32): nav, route transitions, footer and the Konami easter egg.
// Mode screens (/runs/*) hide the nav and footer themselves.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const nav = await getNavState();
  return (
    <html lang="en" className={`${pixelify.variable} ${mulish.variable} ${vt323.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ClerkProvider>
          <ToastProvider>
            <a
              href="#main"
              className="sr-only z-50 rounded-sm bg-primary px-3 py-2 font-display text-primary-text focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
            >
              Skip to content
            </a>
            {/* SiteNav seeds its state from `initial` once. Keyed so Clerk's router.refresh() after
                sign-in/out remounts it with the new auth state instead of keeping the stale one. */}
            <SiteNav key={nav.signedIn ? "signed-in" : "signed-out"} initial={nav} />
            <div id="main" className="flex flex-1 flex-col">
              <RouteTransition>{children}</RouteTransition>
            </div>
            <SiteFooter />
            <KonamiFishing />
          </ToastProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
