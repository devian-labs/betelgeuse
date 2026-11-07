"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

const WorkspaceApp = dynamic(() => import("@/components/WorkspaceApp"), { ssr: false });

export default function Page() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  return <WorkspaceApp owner={decodeURIComponent(owner)} repo={decodeURIComponent(repo)} />;
}
