"use client";

import { useEffect, useState } from "react";
import { detectDevice, pickDownload, type Device } from "@/lib/download";
import { useRelease } from "./GitHub";

/**
 * Downloads the build for this device straight away. It also moves to the download section, which
 * explains the warning unsigned builds bring up and lists the other builds. Without a build to offer
 * (an iPhone, or no release), it just goes there.
 */
export function NavDownload() {
  const { release } = useRelease();
  const [device, setDevice] = useState<Device | null>(null);
  useEffect(() => void detectDevice().then(setDevice), []);
  const asset = release && device ? pickDownload(release.assets, device) : null;
  return (
    <a
      className="button small primary nav-download"
      href={asset?.url ?? "#download"}
      onClick={() => {
        // Not by changing the URL: that would cancel the download while GitHub redirects it.
        if (asset) document.getElementById("download")?.scrollIntoView({ behavior: "smooth" });
      }}
    >
      Download
    </a>
  );
}
