import type { Metadata } from "next";
import { loadDoc } from "@/lib/docs";
import { pageMetadata } from "@/lib/site";
import { DocPage } from "./DocPage";

export const metadata: Metadata = pageMetadata({
  title: "Documentation | Betelgeuse",
  description: loadDoc("")!.description,
  path: "/docs/",
});

export default function DocsHome() {
  return <DocPage slug="" />;
}
