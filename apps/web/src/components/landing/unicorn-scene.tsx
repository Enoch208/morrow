"use client";

import Script from "next/script";
import { useEffect } from "react";

declare global {
  interface Window {
    UnicornStudio?: {
      init: () => Promise<unknown[]>;
      destroy: () => void;
    };
  }
}

const unicornStudioSrc =
  "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.4.29/dist/unicornStudio.umd.js";

function initializeScenes() {
  void window.UnicornStudio?.init();
}

export function UnicornScene({ projectId }: { projectId: string }) {
  useEffect(() => {
    return () => {
      window.UnicornStudio?.destroy();
    };
  }, []);

  return (
    <>
      <div data-us-project={projectId} className="absolute w-full h-full left-0 top-0 -z-10" />
      <Script src={unicornStudioSrc} strategy="afterInteractive" onReady={initializeScenes} />
    </>
  );
}
