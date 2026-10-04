import "server-only";
import { createHash } from "node:crypto";
import graph from "@/db/seed/courses/python-basics.sonar.json";

// Sonar (F32): which Concepts a Python Basics Prompt tests. Tags live in the sidecar
// (db/seed/courses/python-basics.sonar.json), keyed by tagKey(prompt text), so the content-hashed
// seeded Games never change. A Prompt with no tag falls back to its Topic's Concepts.

/** The sidecar key for a Prompt: sha1 of its text (prompts.text, trimmed), hex. */
export function tagKey(promptText: string): string {
  return createHash("sha1").update(promptText.trim()).digest("hex");
}

const tags = graph.tags as Record<string, string[]>;
const byTopic = new Map<string, string[]>();
for (const c of graph.concepts) byTopic.set(c.topic, [...(byTopic.get(c.topic) ?? []), c.id]);

/** The Prompt's Concepts, primary first (at most 3). Falls back to the Topic's Concepts, else []. */
export function conceptsForPrompt(promptText: string, topicSlug?: string | null): string[] {
  const tagged = tags[tagKey(promptText)];
  if (tagged?.length) return tagged.slice(0, 3);
  return topicSlug ? (byTopic.get(topicSlug) ?? []) : [];
}
