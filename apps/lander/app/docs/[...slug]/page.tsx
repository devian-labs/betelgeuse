import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ALL, href, loadDoc } from "@/lib/docs";
import { pageMetadata } from "@/lib/site";
import { DocPage } from "../DocPage";

export const dynamicParams = false;

export function generateStaticParams() {
  return ALL.filter((e) => e.slug).map((e) => ({ slug: e.slug.split("/") }));
}

type Params = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const slug = (await params).slug.join("/");
  const doc = loadDoc(slug);
  if (!doc) return {};
  return pageMetadata({ title: `${doc.title} | Betelgeuse docs`, description: doc.description, path: href(slug) });
}

export default async function Doc({ params }: Params) {
  const slug = (await params).slug.join("/");
  if (!loadDoc(slug)) notFound();
  return <DocPage slug={slug} />;
}
