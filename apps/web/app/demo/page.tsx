"use client";

import dynamic from "next/dynamic";

// The interface is browser-only: it reads the theme, storage and window as its modules load.
const DemoApp = dynamic(() => import("@/components/DemoApp"), { ssr: false });

export default function Page() {
  return <DemoApp />;
}
