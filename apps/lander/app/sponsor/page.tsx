import { ArrowUpRight, Bug, Code2, Coffee, Heart, IndianRupee, Lightbulb, Star } from "lucide-react";
import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { PlainPage } from "@/components/PlainPage";
import { API } from "@/lib/github";
import { ORG, REPO, SITE_NAME, SITE_URL, SPONSOR, jsonLd, pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Support Betelgeuse: Sponsor the Open-Source Notes App",
  description: "Betelgeuse is free and open source. Tips and sponsorships pay for signed downloads, so the app installs without warnings on macOS and Windows.",
  path: "/sponsor/",
});

const breadcrumbs = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: "Support", item: `${SITE_URL}/sponsor/` },
  ],
};

/** What a year of Betelgeuse costs, at the providers' list prices (USD). Update when a price or a provider changes. */
const COSTS = [
  { what: "Apple Developer Program", why: "Signs and notarises the Mac app, so it opens with a double-click", usd: 99 },
  { what: "Windows code signing", why: "So Windows doesn't warn that the installer is from an unknown publisher", usd: 120 },
];

async function stars(): Promise<number | null> {
  try {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const r = await fetch(API, { headers, next: { revalidate: 600 } });
    return r.ok ? ((await r.json()).stargazers_count as number) : null;
  } catch {
    return null;
  }
}

/** Every "Sponsor" button in the apps, the README and the repository lands here (lib/site.ts: SPONSOR). */
export default async function Sponsor() {
  const starCount = await stars();
  const total = COSTS.reduce((a, c) => a + c.usd, 0);

  return (
    <PlainPage title="Support" wide>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(breadcrumbs)} />

      <section className="sp-hero">
        <div className="sp-star" aria-hidden>
          <span className="sp-orbit sp-orbit-1">
            <i />
          </span>
          <span className="sp-orbit sp-orbit-2">
            <i />
          </span>
          <Logo size={64} />
        </div>
        <h1>Keep the star burning</h1>
        <p className="sp-lead">
          Betelgeuse is free, open source and made by a small team. No ads, no accounts, and your pages never leave your devices. Support keeps it that
          way.
        </p>
      </section>

      <h2>Ways to give</h2>
      <div className="sp-ways">
        {SPONSOR.kofi && (
          <a className="sp-way sp-way-main" href={SPONSOR.kofi}>
            <span className="sp-way-icon">
              <Coffee size={20} />
            </span>
            <span className="sp-way-name">Ko-fi</span>
            <span className="sp-way-text">A one-off tip or a monthly membership, by card or PayPal, from anywhere.</span>
            <span className="sp-way-cta">
              Buy a coffee <ArrowUpRight size={15} />
            </span>
          </a>
        )}
        {SPONSOR.razorpay && (
          <a className="sp-way" href={SPONSOR.razorpay}>
            <span className="sp-way-icon">
              <IndianRupee size={20} />
            </span>
            <span className="sp-way-name">Razorpay</span>
            <span className="sp-way-text">UPI or an Indian card, in rupees.</span>
            <span className="sp-way-cta">
              Pay with UPI <ArrowUpRight size={15} />
            </span>
          </a>
        )}
        {SPONSOR.githubSponsors ? (
          <a className="sp-way" href={SPONSOR.githubSponsors}>
            <span className="sp-way-icon">
              <Heart size={20} />
            </span>
            <span className="sp-way-name">GitHub Sponsors</span>
            <span className="sp-way-text">Monthly or one-off, billed with your GitHub account. GitHub takes no fee.</span>
            <span className="sp-way-cta">
              Sponsor <ArrowUpRight size={15} />
            </span>
          </a>
        ) : (
          <div className="sp-way sp-way-soon">
            <span className="sp-way-icon">
              <Heart size={20} />
            </span>
            <span className="sp-way-name">
              GitHub Sponsors <span className="sp-badge">Soon</span>
            </span>
            <span className="sp-way-text">Monthly or one-off, billed with your GitHub account. Waiting for GitHub&apos;s approval.</span>
          </div>
        )}
      </div>

      <h2>Where it goes</h2>
      <div className="sp-receipt" role="table" aria-label="What a year of Betelgeuse costs">
        <div className="sp-receipt-head" role="row">
          <span role="columnheader">One year of Betelgeuse</span>
          <span role="columnheader">USD</span>
        </div>
        {COSTS.map((c) => (
          <div className="sp-receipt-row" role="row" key={c.what}>
            <span role="cell">
              <strong>{c.what}</strong>
              <span className="sp-receipt-why">{c.why}</span>
            </span>
            <span role="cell" className="sp-receipt-usd">
              ${c.usd}
            </span>
          </div>
        ))}
        <div className="sp-receipt-row sp-receipt-time" role="row">
          <span role="cell">
            <strong>Evenings and weekends</strong>
            <span className="sp-receipt-why">New features, fixes, the web app and this site</span>
          </span>
          <span role="cell" className="sp-receipt-usd">
            ∞
          </span>
        </div>
        <div className="sp-receipt-total" role="row">
          <span role="cell">Each year, at least</span>
          <span role="cell">${total}</span>
        </div>
        <p className="sp-receipt-note">Anything beyond that goes into time on Betelgeuse.</p>
      </div>

      <h2>Free ways to help</h2>
      <div className="sp-help">
        <a className="sp-help-card" href={REPO}>
          <Star size={18} />
          <strong>Star the repository</strong>
          <span>{starCount ? `Join ${starCount.toLocaleString("en")} others. A star for a star.` : "A star for a star."}</span>
        </a>
        <a className="sp-help-card" href={`${REPO}/issues`}>
          <Bug size={18} />
          <strong>Report a bug</strong>
          <span>Something broken or confusing? Tell us.</span>
        </a>
        <a className="sp-help-card" href={`${REPO}/discussions`}>
          <Lightbulb size={18} />
          <strong>Share an idea</strong>
          <span>What should Betelgeuse do next?</span>
        </a>
        <a className="sp-help-card" href={`${REPO}/blob/main/CONTRIBUTING.md`}>
          <Code2 size={18} />
          <strong>Contribute</strong>
          <span>Code, docs or a plugin of your own.</span>
        </a>
      </div>

      <p className="sp-thanks">
        Thank you. Betelgeuse is built by <a href={ORG.url}>{ORG.name}</a>.
      </p>
    </PlainPage>
  );
}
