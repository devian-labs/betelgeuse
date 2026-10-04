"use client";

import { useState } from "react";
import { Shot } from "./Shot";

/** The product walkthrough video, or a still of the app if the video can't play. */
export function Walkthrough() {
  const [failed, setFailed] = useState(false);
  if (failed) return <Shot name="editor" theme="dark" alt="The Betelgeuse editor with the Welcome guide open" />;
  return (
    <figure className="walkthrough">
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster="/assets/walkthrough-poster.jpg"
        aria-label="Betelgeuse in use: creating a page, adding blocks, a database board, page history and connecting an agent"
        onError={() => setFailed(true)}
      >
        <source src="/assets/walkthrough.webm" type="video/webm" />
        {/* The last source's error means no format could play. */}
        <source src="/assets/walkthrough.mp4" type="video/mp4" onError={() => setFailed(true)} />
      </video>
    </figure>
  );
}
