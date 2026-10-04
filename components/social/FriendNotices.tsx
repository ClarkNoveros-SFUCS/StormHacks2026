"use client";
// Pop-ups for friend requests you sent that were accepted (#79). Mounted once in the root layout
// for signed-in Players: asks the server on load, every 30 s while the tab is visible, and when
// the tab comes back into view. The server marks each acceptance as told, so it shows once.
import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import type { AcceptedNotice } from "@/lib/social/types";

const EVERY_MS = 30_000;

export function FriendNotices() {
  const toast = useToast();

  useEffect(() => {
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await fetch("/api/friends/notices", { method: "POST" });
        if (!res.ok) return;
        const { accepted } = (await res.json()) as { accepted: AcceptedNotice[] };
        for (const { player } of accepted) {
          toast({
            title: `${player.displayName} accepted your friend request`,
            body: "You're friends now. Tap to see their profile.",
            tone: "success",
            icon: "users",
            ms: 7000,
            href: player.username ? `/u/${player.username}` : "/friends",
          });
        }
      } catch {
        // offline or signed out mid-session: try again next time
      } finally {
        busy = false;
      }
    };
    check();
    const timer = setInterval(check, EVERY_MS);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [toast]);

  return null;
}
