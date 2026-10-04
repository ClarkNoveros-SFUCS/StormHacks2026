import { describe, expect, it } from "vitest";
import { MAX_CHATS, MAX_MSGS, newChat, searchChats, titleFor, whenLabel, withMsgs, type ChatMsg } from "./chats";

const player = (id: number, text: string): ChatMsg => ({ id, role: "player", text });
const sonar = (id: number, text: string): ChatMsg => ({ id, role: "sonar", text, actions: [] });

describe("saved Sonar chats", () => {
  it("titles a chat from the first question, else Sonar's first sentence", () => {
    expect(titleFor([sonar(1, "Hey! Two files are ready."), player(2, "  what is a **stem** plot? ")])).toBe("what is a stem plot?");
    expect(titleFor([sonar(1, "Hey there! You've got two files.")])).toBe("Hey there!");
    expect(titleFor([player(1, "x".repeat(80))])).toHaveLength(60);
    expect(titleFor([])).toBe("");
  });

  it("moves the updated chat to the top, keeps its title, drops empty chats", () => {
    const a = { ...newChat(1), id: "a" };
    const b = { ...newChat(2), id: "b" };
    let chats = withMsgs([], "a", [player(1, "first")], 10);
    chats = withMsgs(chats, "b", [player(2, "second")], 20);
    expect(chats.map((c) => c.id)).toEqual(["b", "a"]);
    chats = withMsgs(chats, "a", [player(1, "first"), player(3, "renamed?")], 30);
    expect(chats[0]).toMatchObject({ id: "a", title: "first", updatedAt: 30 });
    expect(withMsgs([a, b], "a", [], 5)).toEqual([]);
  });

  it("caps messages per chat and the number of chats", () => {
    const many = Array.from({ length: MAX_MSGS + 5 }, (_, i) => player(i, `m${i}`));
    expect(withMsgs([], "a", many)[0].msgs).toHaveLength(MAX_MSGS);
    let chats = withMsgs([], "c0", [player(0, "x")]);
    for (let i = 1; i <= MAX_CHATS + 3; i++) chats = withMsgs(chats, `c${i}`, [player(i, "x")]);
    expect(chats).toHaveLength(MAX_CHATS);
    expect(chats[0].id).toBe(`c${MAX_CHATS + 3}`);
  });

  it("searches titles and message text", () => {
    const chats = withMsgs(withMsgs([], "a", [player(1, "stem and leaf")]), "b", [player(2, "loops"), sonar(3, "Try a Dive on ogives")]);
    expect(searchChats(chats, "OGIVE").map((c) => c.id)).toEqual(["b"]);
    expect(searchChats(chats, " ")).toHaveLength(2);
  });

  it("labels dates relative to today", () => {
    const now = new Date(2026, 9, 4, 15, 0).getTime();
    expect(whenLabel(new Date(2026, 9, 3, 9, 0).getTime(), now)).toBe("Yesterday");
    expect(whenLabel(new Date(2026, 9, 1).getTime(), now)).toMatch(/Oct/);
  });
});
