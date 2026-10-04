import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import { briefingFor, modelSnapshot, tagPage, trimHistory } from "./agent";
import { parseChatRequest } from "./chat-request";
import { FIXTURE_MODEL } from "./fixtures";
import { decodeAnswered } from "./mistakes";
import { headings } from "./page-context";
import { scopeFor } from "./tools";

describe("decodeAnswered", () => {
  it("decodes each raw_text shape", () => {
    expect(decodeAnswered(null)).toBe("(timeout)");
    expect(decodeAnswered("range(5)")).toBe("range(5)");
    expect(decodeAnswered('"print()"')).toBe("print()");
    expect(decodeAnswered("true")).toBe("True");
    expect(decodeAnswered('["a","b"]')).toBe("a → b");
    expect(decodeAnswered('{"term":"x","definition":"y"}')).toBe("x ↔ y");
    expect(decodeAnswered("42")).toBe("42");
  });
});

describe("trimHistory", () => {
  it("keeps short histories and starts long ones at a Player message", () => {
    const short = [new HumanMessage("hi"), new AIMessage("yo")];
    expect(trimHistory(short)).toBe(short);
    const long = [
      new HumanMessage("a"),
      new AIMessage({ content: "", tool_calls: [{ id: "1", name: "x", args: {} }] }),
      new ToolMessage({ content: "r", tool_call_id: "1" }),
      new AIMessage("b"),
      new HumanMessage("c"),
      new AIMessage("d"),
    ];
    const t = trimHistory(long, 4);
    expect(t[0].getType()).toBe("human");
    expect(t.map((m) => m.text)).toEqual(["c", "d"]);
  });
});

describe("chat request", () => {
  it("validates and derives the context from the path", () => {
    expect(parseChatRequest({ context: {} }).ok).toBe(false);
    expect(parseChatRequest({ context: { path: "/home" }, message: "x".repeat(1001) }).ok).toBe(false);
    const r = parseChatRequest({ context: { path: "/explore/python-basics/loops", kind: "module" }, message: "  why? " });
    expect(r).toEqual({ ok: true, message: "why?", context: { kind: "topic", path: "/explore/python-basics/loops", courseSlug: "python-basics", topicSlug: "loops" } });
    expect(parseChatRequest({ context: { path: "/home" } })).toMatchObject({ ok: true, message: undefined });
  });

  it("takes an optional chatId and rejects odd ones", () => {
    expect(parseChatRequest({ context: { path: "/home" }, chatId: "c_k9x2-a" })).toMatchObject({ ok: true, chatId: "c_k9x2-a" });
    expect(parseChatRequest({ context: { path: "/home" } })).toMatchObject({ ok: true, chatId: undefined });
    expect(parseChatRequest({ context: { path: "/home" }, chatId: "a b" }).ok).toBe(false);
    expect(parseChatRequest({ context: { path: "/home" }, chatId: "x".repeat(41) }).ok).toBe(false);
    expect(parseChatRequest({ context: { path: "/home" }, chatId: 7 }).ok).toBe(false);
  });
});

describe("prompt pieces", () => {
  it("snapshots the model with ranks and the root cause", () => {
    const s = modelSnapshot(FIXTURE_MODEL);
    expect(s).toContain("Root cause: comparison_ops");
    expect(s).toContain("rank 0:");
    expect(modelSnapshot({ ...FIXTURE_MODEL, observations: 0 })).toContain("hasn't played");
  });
  it("briefs per page and scopes mistakes per page", () => {
    expect(briefingFor({ kind: "module", path: "/modules/x", moduleId: "x" }, true)).toContain("propose_game");
    const revealOfModule = briefingFor({ kind: "reveal", path: "/runs/r/reveal", runId: "r" }, true);
    expect(revealOfModule).toContain("suggest_reading");
    expect(revealOfModule).toContain("this Run");
    expect(briefingFor({ kind: "reveal", path: "/runs/r/reveal", runId: "r" })).not.toContain("suggest_reading");
    expect(scopeFor({ kind: "reveal", path: "/runs/r/reveal", runId: "r" })).toEqual({ kind: "run", runId: "r" });
    expect(scopeFor({ kind: "home", path: "/home" })).toEqual({ kind: "course" });
  });
  it("tags the Player's message with its page", () => {
    expect(tagPage("why?", { kind: "reveal", path: "/runs/r/reveal", runId: "r" }, { moduleId: "m", name: "CMPT 354" }))
      .toBe('[Page: reveal /runs/r/reveal, Module "CMPT 354"]\nwhy?');
    expect(tagPage("hi", { kind: "home", path: "/home" }, null)).toBe("[Page: home /home]\nhi");
  });
  it("pulls headings from a page", () => {
    expect(headings("# A\ntext\n## B")).toEqual(["A", "B"]);
    expect(headings("plain first line\nmore")).toEqual(["plain first line"]);
  });
});
