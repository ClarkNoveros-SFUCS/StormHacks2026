import { clerkMiddleware } from "@clerk/nextjs/server";

// Attaches the Clerk session to every request. It does not gate routes: Clerk deprecated
// path-matching checks here. Every page, route handler and server action that touches
// Player data calls `requirePlayer()` (lib/auth.ts), which protects that resource itself.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next internals and static files unless they appear in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Clerk's Frontend API auto-proxy
    "/__clerk/:path*",
  ],
};
