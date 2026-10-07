import type { Metadata } from "next";

export const REPO = "https://github.com/devian-labs/betelgeuse";
export const RELEASES = `${REPO}/releases/latest`;

/** The production origin: metadataBase, canonical URLs, the sitemap and structured data all build on it. */
export const SITE_URL = "https://betelgeuse.devianlabs.com";
export const SITE_NAME = "Betelgeuse";
export const ORG = { name: "Devian Labs", url: "https://devianlabs.com", github: "https://github.com/devian-labs" };

/** Serialise JSON-LD for a <script> tag, escaping `<` so no string can close the tag. */
export function jsonLd(data: object) {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}

/**
 * A page's title, description, canonical URL and social cards. Next merges metadata shallowly, so each page
 * repeats the whole openGraph/twitter objects rather than inheriting parts of them from the layout. The share
 * image is app/opengraph-image.jpg: Next adds it by itself to the root page only, so nested pages name it here.
 */
const shareImage = {
  url: "/opengraph-image.jpg",
  width: 1200,
  height: 630,
  type: "image/jpeg",
  alt: "The Betelgeuse editor showing the Welcome page: a block-based notebook that stores everything as Markdown files in a git repository",
};

export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type: "website", siteName: SITE_NAME, locale: "en_US", images: [shareImage] },
    twitter: { card: "summary_large_image", title, description, images: [shareImage] },
  };
}
