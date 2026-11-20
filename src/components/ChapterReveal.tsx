"use client";

import { useEffect } from "react";

export function ChapterReveal() {
  useEffect(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduce || !("IntersectionObserver" in window)) {
      return;
    }

    document.documentElement.classList.add("js");

    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(".reveal")
    );
    const timers: number[] = [];

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            target.classList.add("open");
            observer.unobserve(target);
            const timerId = window.setTimeout(() => {
              target.classList.add("opened");
            }, 900);
            timers.push(timerId);
          }
        }
      },
      { threshold: 0.12 }
    );

    for (const el of elements) {
      observer.observe(el);
    }

    return () => {
      observer.disconnect();
      for (const timerId of timers) {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  return null;
}
