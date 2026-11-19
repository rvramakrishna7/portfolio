"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(document.documentElement.scrollTop > 20);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleOpenPalette = (e: React.MouseEvent<HTMLButtonElement>) => {
    window.dispatchEvent(
      new CustomEvent("portfolio:open-palette", {
        detail: { opener: e.currentTarget },
      })
    );
  };

  return (
    <header className={`site-head${scrolled ? " scrolled" : ""}`}>
      <Link className="brand" href="/">
        Rama<b>krishna</b>
      </Link>
      <nav className="nav" aria-label="Main">
        <Link className="hide-s" href="/#work">
          Work
        </Link>
        <Link className="hide-s" href="/#experience">
          Experience
        </Link>
        <Link className="hide-s" href="/#skills">
          Skills
        </Link>
      </nav>
      <div className="head-actions">
        <button
          className="btn ghost"
          type="button"
          data-open-palette
          aria-haspopup="dialog"
          aria-expanded="false"
          aria-controls="palette"
          onClick={handleOpenPalette}
        >
          <span className="jump-label">Jump to</span>{" "}
          <span className="kbd">Ctrl K</span>
        </button>
        <Link className="btn primary" href="/#contact">
          Contact
        </Link>
      </div>
    </header>
  );
}
