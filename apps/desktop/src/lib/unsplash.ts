/**
 * Unsplash photo search for page covers. Release builds include Betelgeuse's Access Key (from the
 * VITE_UNSPLASH_ACCESS_KEY build variable: `.env.local` locally, a CI secret for releases). Anyone
 * can use their own key instead; it overrides the built-in one and stays on their computer.
 * API guidelines followed: photos are hotlinked from Unsplash, the photographer is credited, and
 * picking a photo notifies Unsplash's download endpoint.
 */
export const UNSPLASH_APPS = "https://unsplash.com/oauth/applications";
export const BUILT_IN_KEY: string = import.meta.env?.VITE_UNSPLASH_ACCESS_KEY ?? ""; // env is undefined outside Vite (tests)
/** The key to use: the person's own, else the built-in one. */
export const unsplashKey = (own: string) => own.trim() || BUILT_IN_KEY;
const API = "https://api.unsplash.com";

export type UnsplashPhoto = {
  id: string;
  thumb: string;
  /** The cover-sized image URL to store. */
  cover: string;
  author: string;
  authorUrl: string;
  /** The photo's page on Unsplash. */
  url: string;
  color: string | null;
  downloadLocation: string;
};

type ApiPhoto = {
  id: string;
  color: string | null;
  urls: { raw: string; small: string };
  user: { name: string; links: { html: string } };
  links: { download_location: string; html: string };
};

export class UnsplashError extends Error {}

export async function searchUnsplash(key: string, query: string, page = 1): Promise<{ photos: UnsplashPhoto[]; pages: number }> {
  const url = `${API}/search/photos?query=${encodeURIComponent(query)}&page=${page}&per_page=24&orientation=landscape&content_filter=high`;
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" } });
  if (res.status === 401) throw new UnsplashError("Unsplash didn't accept that Access Key.");
  if (res.status === 403 || res.status === 429) throw new UnsplashError("The hourly Unsplash search limit is used up. Try again in a while, or use your own key.");
  if (!res.ok) throw new UnsplashError(`Unsplash search failed (${res.status}).`);
  const data: { results: ApiPhoto[]; total_pages: number } = await res.json();
  const ref = "utm_source=betelgeuse&utm_medium=referral";
  return {
    pages: data.total_pages,
    photos: data.results.map((p) => ({
      id: p.id,
      thumb: p.urls.small,
      // The whole photo (not a cropped band), so it can be repositioned from top to bottom.
      cover: `${p.urls.raw}&w=2000&q=80`,
      author: p.user.name,
      authorUrl: `${p.user.links.html}?${ref}`,
      url: `${p.links.html}?${ref}`,
      color: p.color,
      downloadLocation: p.links.download_location,
    })),
  };
}

/** Unsplash asks apps to report when a photo is used. */
export function reportDownload(key: string, photo: UnsplashPhoto) {
  fetch(photo.downloadLocation, { headers: { Authorization: `Client-ID ${key}` } }).catch(() => {});
}

/** Unsplash asks for "Photo by <name> on Unsplash" wherever its photos are shown. */
export type Credit = { name: string; url: string };
export const UNSPLASH_HOME = "https://unsplash.com/?utm_source=betelgeuse&utm_medium=referral";
