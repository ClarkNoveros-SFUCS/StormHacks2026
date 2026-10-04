import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DivePlayground from "@/components/modes/dive/DivePlayground";

export const metadata: Metadata = { title: "Dive playground · SYLLABYSS" };

// Dev-only: a fake 7-prompt Dive run entirely client-side (no API), to check the descent and
// catch-screen flow without the run engine. 404 in production.
export default function DivePlaygroundPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DivePlayground />;
}
