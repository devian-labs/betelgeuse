import Script from "next/script";

// Measurement ID comes from NEXT_PUBLIC_GA_ID; renders nothing when it is unset.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "G-EZBLRHBYH6";

export function GoogleAnalytics() {
  if (!GA_ID) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
      </Script>
    </>
  );
}
