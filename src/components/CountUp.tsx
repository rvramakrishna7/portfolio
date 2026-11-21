"use client";

import { useEffect, useRef } from "react";

interface CountUpProps {
  target: number;
  initialText: string;
}

export function CountUp({ target, initialText }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduce || !("IntersectionObserver" in window)) {
      el.textContent = initialText;
      return;
    }

    let done = false;
    let rafId = 0;

    const observer = new IntersectionObserver(
      (entries) => {
        if (done || !entries[0]?.isIntersecting) return;
        done = true;
        observer.disconnect();

        const start = performance.now();
        const duration = 1000;
        let lastVal = -1;

        const step = (now: number) => {
          const progress = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = Math.round(target * eased);

          if (current !== lastVal) {
            lastVal = current;
            el.textContent = current.toLocaleString("en-US");
          }

          if (progress < 1) {
            rafId = requestAnimationFrame(step);
          } else {
            el.textContent = initialText;
          }
        };

        rafId = requestAnimationFrame(step);
      },
      { threshold: 0.6 }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [target, initialText]);

  return (
    <span ref={ref} data-count={target}>
      {initialText}
    </span>
  );
}
