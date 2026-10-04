import { describe, expect, it } from "vitest";
import { bubbleFor, MAX_BUBBLE_CHARS } from "./bubble";
import { contextFromPath } from "./context-path";
import { FIXTURE_MODEL } from "./fixtures";
import type { SonarModel } from "./types";

const reveal = contextFromPath("/runs/3cb4ab3b-265d-4937-8f3f-7f5f71a1cd70/reveal");
const topic = (slug: string, course = "python-basics") => contextFromPath(`/explore/${course}/${slug}`);
const moduleCtx = contextFromPath("/modules/0ac26be3-9c9d-4761-a0ab-7212e27a3e25");

/** The fixture with the root cause moved off Topic 3, so the nudge branch is reachable there. */
const noRootModel: SonarModel = { ...FIXTURE_MODEL, rootCause: null };

describe("bubbleFor: reveal", () => {
  it("nudges about the misses", () => {
    const b = bubbleFor(reveal, { run: { misses: 3, prompts: 10, topicTitle: "Loops", gameTitle: "Loops · Leap" } });
    expect(b).toEqual({ text: "3 misses on Loops… want to know why?", tone: "nudge", prompt: "Why did I miss those in my last run?" });
  });

  it("says miss, not misses, for one", () => {
    expect(bubbleFor(reveal, { run: { misses: 1, prompts: 7, topicTitle: null, gameTitle: "Bio notes" } })?.text).toBe(
      "1 miss on Bio notes… want to know why?",
    );
  });

  it("drops the title when it would overflow", () => {
    const b = bubbleFor(reveal, { run: { misses: 4, prompts: 7, topicTitle: null, gameTitle: "x".repeat(80) } });
    expect(b?.text).toBe("4 misses this run… want to know why?");
  });

  it("cheers a clean Run", () => {
    expect(bubbleFor(reveal, { run: { misses: 0, prompts: 10, topicTitle: "Loops", gameTitle: "Loops" } })?.tone).toBe("cheer");
  });

  it("is null without the Run", () => {
    expect(bubbleFor(reveal, { run: null })).toBeNull();
  });
});

describe("bubbleFor: topic", () => {
  it("alerts when the root cause is in this Topic", () => {
    const b = bubbleFor(topic("operators-expressions"), { model: FIXTURE_MODEL });
    expect(b?.tone).toBe("alert");
    expect(b?.prompt).toMatch(/causing my mistakes/);
  });

  it("nudges a passed Topic Sonar hasn't heard mastered", () => {
    const b = bubbleFor(topic("operators-expressions"), { model: noRootModel });
    expect(b).toEqual({
      text: "Course says passed. I'm hearing 66%…",
      tone: "nudge",
      prompt: "Why do you think I haven't mastered Operators & Expressions?",
    });
  });

  it("is null for a mastered Topic", () => {
    expect(bubbleFor(topic("hello-world-syntax"), { model: noRootModel })).toBeNull();
  });

  it("is null for a Topic not passed yet (no root cause there)", () => {
    expect(bubbleFor(topic("loops"), { model: noRootModel })).toBeNull();
  });

  it("is null for a new Player, another Course, or no model", () => {
    expect(bubbleFor(topic("operators-expressions"), { model: { ...FIXTURE_MODEL, observations: 0 } })).toBeNull();
    expect(bubbleFor(topic("intro", "biology"), { model: FIXTURE_MODEL })).toBeNull();
    expect(bubbleFor(topic("operators-expressions"), {})).toBeNull();
  });
});

describe("bubbleFor: module", () => {
  it("names the file with the most misses", () => {
    const b = bubbleFor(moduleCtx, { module: { misses: 8, files: [{ filename: "week3.pdf", misses: 6 }, { filename: "a.pdf", misses: 2 }] } });
    expect(b).toEqual({ text: "You missed 6 on week3.pdf. Want me to dig in?", tone: "nudge", prompt: "What am I getting wrong in this Module?" });
  });

  it("is null under 3 misses", () => {
    expect(bubbleFor(moduleCtx, { module: { misses: 2, files: [{ filename: "a.pdf", misses: 2 }] } })).toBeNull();
  });

  it("fits a long filename in the limit", () => {
    const b = bubbleFor(moduleCtx, { module: { misses: 5, files: [{ filename: `${"lecture-".repeat(10)}.pdf`, misses: 5 }] } });
    expect(b!.text.length).toBeLessThanOrEqual(MAX_BUBBLE_CHARS);
  });
});

describe("bubbleFor: other pages", () => {
  it("is null", () => {
    for (const p of ["/home", "/explore", "/explore/python-basics", "/modules", "/daily"]) {
      expect(bubbleFor(contextFromPath(p), { model: FIXTURE_MODEL })).toBeNull();
    }
  });
});
