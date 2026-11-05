import type { Metadata } from "next";
import { loadDoc } from "@/lib/docs";
import { pageMetadata } from "@/lib/site";
import { DocPage } from "./DocPage";

export const metadata: Metadata = pageMetadata({
  title: "Betelgeuse Documentation: Guides, AI Agents and Plugins",
  description: loadDoc("")!.description,
  path: "/docs/",
});

export default function DocsHome() {
  return <DocPage slug="" />;
}
