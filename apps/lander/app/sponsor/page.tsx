import type { Metadata } from "next";
import { PlainPage } from "@/components/PlainPage";
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

/** Every "Sponsor" button in the apps, the README and the repository lands here (lib/site.ts: SPONSOR). */
export default function Sponsor() {
  return (
    <PlainPage title="Support">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(breadcrumbs)} />
      <h1>Support Betelgeuse</h1>
      <p>
        Betelgeuse is free, open source and made by one small team. Your support pays for what keeps it easy to use, and keeps it independent: no ads,
        and your pages never leave your devices.
      </p>

      <h2>Ways to give</h2>
      <ul>
        {SPONSOR.kofi && (
          <li>
            <a href={SPONSOR.kofi}>
              <strong>Ko-fi</strong>
            </a>
            : a one-off tip, or a monthly membership, with a card or PayPal from anywhere.
          </li>
        )}
        {SPONSOR.razorpay && (
          <li>
            <a href={SPONSOR.razorpay}>
              <strong>Razorpay</strong>
            </a>
            : UPI or an Indian card, in rupees.
          </li>
        )}
        <li>
          {SPONSOR.githubSponsors ? (
            <>
              <a href={SPONSOR.githubSponsors}>
                <strong>GitHub Sponsors</strong>
              </a>
              : monthly or one-off, billed with your GitHub account. GitHub takes no fee.
            </>
          ) : (
            <>
              <strong>GitHub Sponsors</strong>: coming soon.
            </>
          )}
        </li>
      </ul>

      <h2>What it pays for</h2>
      <ul>
        <li>
          <strong>Signed downloads.</strong> An Apple developer account and a Windows code-signing certificate, so Betelgeuse installs with a double-click
          instead of a security warning.
        </li>
        <li>
          <strong>The web app and this site</strong>, and the time to keep improving them.
        </li>
      </ul>

      <h2>Other ways to help</h2>
      <ul>
        <li>
          <a href={REPO}>Star the repository</a> and tell a friend.
        </li>
        <li>
          <a href={`${REPO}/issues`}>Report a bug</a> or <a href={`${REPO}/discussions`}>share an idea</a>.
        </li>
        <li>
          <a href={`${REPO}/blob/main/CONTRIBUTING.md`}>Contribute</a> code, docs or a plugin.
        </li>
      </ul>
      <p>
        Thank you. Betelgeuse is built by <a href={ORG.url}>{ORG.name}</a>.
      </p>
    </PlainPage>
  );
}
