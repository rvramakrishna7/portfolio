"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface PaletteItem {
  label: string;
  hint: string;
  href: string;
  external?: boolean;
}

const PALETTE_ITEMS: readonly PaletteItem[] = [
  { label: "Experience", hint: "internship", href: "/#experience" },
  { label: "Work", hint: "four stories", href: "/#work" },
  {
    label: "Restart Options",
    hint: "story 01",
    href: "/work/restart-options",
  },
  {
    label: "Team MCP Gateway",
    hint: "story 02",
    href: "/work/mcp-gateway",
  },
  { label: "Vouch", hint: "story 03", href: "/work/vouch" },
  { label: "Zync", hint: "story 04", href: "/work/zync" },
  { label: "Skills", hint: "capabilities", href: "/#skills" },
  { label: "About", hint: "how I work", href: "/#about" },
  { label: "Contact", hint: "send a message", href: "/#contact" },
  {
    label: "Resume",
    hint: "PDF download",
    href: "/resume.pdf",
    external: true,
  },
  {
    label: "LinkedIn",
    hint: "opens in a new tab",
    href: "https://www.linkedin.com/in/rvramakrishna",
    external: true,
  },
  {
    label: "GitHub",
    hint: "opens in a new tab",
    href: "https://github.com/rvramakrishna7",
    external: true,
  },
];

export function CommandPalette() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = PALETTE_ITEMS.filter((item) => {
    if (!normalizedQuery) return true;
    return (
      item.label.toLowerCase().includes(normalizedQuery) ||
      item.hint.toLowerCase().includes(normalizedQuery)
    );
  });

  const setOpenerExpanded = (expanded: boolean) => {
    const btn = document.querySelector<HTMLElement>("[data-open-palette]");
    if (btn) {
      btn.setAttribute("aria-expanded", String(expanded));
    }
  };

  const openPalette = useCallback((explicitOpener?: HTMLElement | null) => {
    const dlg = dialogRef.current;
    if (!dlg || typeof dlg.showModal !== "function") return;

    if (explicitOpener) {
      openerRef.current = explicitOpener;
    } else {
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        active !== document.body &&
        active !== document.documentElement
      ) {
        openerRef.current = active;
      } else {
        openerRef.current =
          document.querySelector<HTMLElement>("[data-open-palette]");
      }
    }

    setQuery("");
    setActiveIndex(0);
    if (!dlg.open) {
      dlg.showModal();
    }
    setOpenerExpanded(true);
    inputRef.current?.focus();
  }, []);

  const closePalette = useCallback(() => {
    const dlg = dialogRef.current;
    if (dlg && dlg.open) {
      dlg.close();
    }
  }, []);

  const handleDialogClose = () => {
    setOpenerExpanded(false);
    const target =
      openerRef.current ??
      document.querySelector<HTMLElement>("[data-open-palette]");
    target?.focus();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const dlg = dialogRef.current;
        if (dlg?.open) {
          closePalette();
        } else {
          openPalette();
        }
      }
    };

    const onCustomOpen = (e: Event) => {
      const custom = e as CustomEvent<{ opener?: HTMLElement }>;
      openPalette(custom.detail?.opener ?? null);
    };

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("portfolio:open-palette", onCustomOpen);
    dialogRef.current?.setAttribute("data-ready", "true");
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("portfolio:open-palette", onCustomOpen);
    };
  }, [closePalette, openPalette]);

  const focusLinkAtIndex = (index: number) => {
    const links = listRef.current?.querySelectorAll<HTMLAnchorElement>("a");
    if (!links || links.length === 0) return;
    const clamped = ((index % links.length) + links.length) % links.length;
    setActiveIndex(clamped);
    links[clamped]?.focus();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const links = listRef.current?.querySelectorAll<HTMLAnchorElement>("a");
      const firstLink = links?.[0];
      if (firstLink) {
        firstLink.click();
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focusLinkAtIndex(0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filteredItems.length > 0) {
        focusLinkAtIndex(filteredItems.length - 1);
      }
    }
  };

  const handleListKeyDown = (
    e: React.KeyboardEvent<HTMLAnchorElement>,
    index: number
  ) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusLinkAtIndex(index + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (index === 0) {
        setActiveIndex(0);
        inputRef.current?.focus();
      } else {
        focusLinkAtIndex(index - 1);
      }
    }
  };

  return (
    <dialog
      ref={dialogRef}
      id="palette"
      className="palette"
      aria-label="Jump to a section"
      onClose={handleDialogClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          closePalette();
        }
      }}
    >
      <input
        ref={inputRef}
        id="pal-input"
        className="pal-in"
        type="text"
        placeholder="Jump to..."
        autoComplete="off"
        aria-label="Search sections"
        aria-controls="pal-list"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={handleInputKeyDown}
      />
      <ul
        ref={listRef}
        id="pal-list"
        className="pal-list"
        aria-label="Sections and stories"
      >
        {filteredItems.map((item, idx) => (
          <li key={item.href}>
            <a
              href={item.href}
              className={idx === activeIndex ? "active" : undefined}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noopener noreferrer" : undefined}
              onKeyDown={(e) => handleListKeyDown(e, idx)}
              onFocus={() => setActiveIndex(idx)}
              onClick={() => closePalette()}
            >
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </a>
          </li>
        ))}
      </ul>
      <p className="pal-hint">Enter to open &middot; Esc to close</p>
    </dialog>
  );
}
