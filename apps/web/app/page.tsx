"use client";

import dynamic from "next/dynamic";

// The interface is browser-only: it reads the theme, storage and window as its modules load.
const Home = dynamic(() => import("@/components/Home"), { ssr: false });

export default function Page() {
  return <Home />;
}
