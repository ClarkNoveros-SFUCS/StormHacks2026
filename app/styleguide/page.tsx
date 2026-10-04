import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StyleguideClient } from "./StyleguideClient";

export const metadata: Metadata = { title: "Styleguide · SYLLABYSS" };

// Dev-only catalogue of every F10 component. Not part of the product: 404 in production.
export default function StyleguidePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StyleguideClient />;
}
