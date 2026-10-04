"use client";
import { useRef, useState } from "react";
import { Button, PixelIcon, useToast } from "@/components/ui";
import { burstFrom } from "@/components/ui/Confetti";
import type { FriendStatus } from "@/lib/social/types";
import { sfx } from "@/lib/ui/sfx";
import { socialApi } from "./api";

type Props = {
  username: string;
  displayName: string;
  status: FriendStatus;
  requestId: string | null;
  size?: "sm" | "md";
  /** Called after every successful change, with the new state. */
  onChange?: (status: FriendStatus, requestId: string | null) => void;
};

/**
 * The friend action for someone else: Add friend → Requested (click to cancel), Accept / Decline
 * for their request, Friends ✓ (click, then confirm, to unfriend). Nothing for yourself.
 */
export function FriendButton({ username, displayName, status: initial, requestId: initialId, size = "md", onChange }: Props) {
  const toast = useToast();
  const [status, setStatus] = useState(initial);
  const [requestId, setRequestId] = useState(initialId);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const host = useRef<HTMLDivElement>(null);

  if (status === "self") return null;

  const set = (s: FriendStatus, id: string | null) => {
    setStatus(s);
    setRequestId(id);
    onChange?.(s, id);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      sfx.error();
      toast({ title: "Something went wrong", body: (e as Error).message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    run(async () => {
      const r = await socialApi.request(username);
      if (r.status === "accepted") {
        set("friends", null);
        sfx.reward();
        burstFrom(host.current, { count: 26, kind: "confetti" });
        toast({ title: "You're friends!", body: `${displayName} had already asked you.`, tone: "success" });
      } else {
        set("outgoing", r.requestId);
        sfx.pop();
        toast({ title: "Request sent", body: `${displayName} will see it on their Friends page.`, tone: "info" });
      }
    });

  const accept = () =>
    run(async () => {
      if (requestId) await socialApi.accept(requestId);
      else await socialApi.request(username); // accepting by asking back works too
      set("friends", null);
      sfx.reward();
      burstFrom(host.current, { count: 30, kind: "confetti" });
      toast({ title: "New friend!", body: `You and ${displayName} are now friends.`, tone: "success" });
    });

  const decline = () =>
    run(async () => {
      if (requestId) await socialApi.decline(requestId);
      else await socialApi.remove(username);
      set("none", null);
      sfx.click();
    });

  const remove = () =>
    run(async () => {
      await socialApi.remove(username);
      set("none", null);
      setConfirm(false);
      sfx.click();
    });

  const sz = size === "sm" ? "sm" : "md";
  return (
    <div ref={host} className="flex flex-wrap items-center gap-2">
      {status === "none" && (
        <Button variant="primary" size={sz} onClick={add} disabled={busy} icon={<PixelIcon name="users" size={16} />}>
          Add friend
        </Button>
      )}
      {status === "outgoing" && (
        <Button
          variant="secondary"
          size={sz}
          onClick={remove}
          disabled={busy}
          title="Cancel your request"
          aria-label={`Requested. Cancel your friend request to ${displayName}`}
          className="group"
          icon={<PixelIcon name="clock" size={16} />}
        >
          <span className="group-hover:hidden group-focus-visible:hidden">Requested</span>
          <span className="hidden group-hover:inline group-focus-visible:inline">Cancel</span>
        </Button>
      )}
      {status === "incoming" && (
        <>
          <Button variant="primary" size={sz} onClick={accept} disabled={busy} icon={<PixelIcon name="check" size={16} />}>
            Accept
          </Button>
          <Button variant="ghost" size={sz} onClick={decline} disabled={busy}>
            Decline
          </Button>
        </>
      )}
      {status === "friends" &&
        (confirm ? (
          <>
            <Button variant="danger" size={sz} onClick={remove} disabled={busy}>
              Unfriend
            </Button>
            <Button variant="ghost" size={sz} onClick={() => setConfirm(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button variant="secondary" size={sz} onClick={() => setConfirm(true)} title="Friends. Click to unfriend" icon={<PixelIcon name="check" size={16} />}>
            Friends
          </Button>
        ))}
    </div>
  );
}
