"use client";

import { useEffect, useRef } from "react";

export function ReadingProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    bar.hidden = false;

    let rafId = 0;
    const updateProgress = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        const doc = document.documentElement;
        const max = doc.scrollHeight - doc.clientHeight;
        const ratio = max > 0 ? Math.min(1, Math.max(0, doc.scrollTop / max)) : 0;
        bar.style.transform = `scaleX(${ratio})`;
      });
    };

    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress, { passive: true });

    // Defer initial read until after first paint
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(updateProgress);
    } else {
      setTimeout(updateProgress, 100);
    }

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, []);

  return <div ref={barRef} className="progress" aria-hidden="true" hidden />;
}
