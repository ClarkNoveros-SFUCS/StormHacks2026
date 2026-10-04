import type { Metadata } from "next";
import { ClerkProvider, Show, UserButton } from "@clerk/nextjs";
import { Mulish, Pixelify_Sans, VT323 } from "next/font/google";
import { Logo } from "@/components/ui/Logo";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

// Site type: Pixelify Sans (headings, buttons), Mulish (body). VT323 is Dive's HUD font.
const pixelify = Pixelify_Sans({ variable: "--font-pixelify", subsets: ["latin"] });
const mulish = Mulish({ variable: "--font-mulish", subsets: ["latin"] });
const vt323 = VT323({ variable: "--font-vt323", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "SYLLABYSS",
  description: "Turn your notes into games. Rarer answers sink deeper.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${pixelify.variable} ${mulish.variable} ${vt323.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ClerkProvider>
          <ToastProvider>
            {/* Minimal header until the full shell lands (F19 #32). Signed-out visitors see the landing page. */}
            <Show when="signed-in">
              <SiteHeader>
                <Logo size="sm" href="/" />
                <div className="flex items-center gap-3">
                  <SoundToggle />
                  <UserButton />
                </div>
              </SiteHeader>
            </Show>
            {children}
          </ToastProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
