import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1}>
      <title>Page not found | Ramakrishna</title>
      <meta
        name="description"
        content="That page is not on this sheet. The link may be old. Start from the top, or jump straight to the work."
      />
      <div className="case-hero">
        <div className="wrap">
          <p className="eyebrow">404</p>
          <h1>That page is not on this sheet.</h1>
          <p className="lede">
            The link may be old. Start from the top, or jump straight to the
            work.
          </p>
          <div className="cta">
            <Link className="btn primary" href="/">
              Start from the top
            </Link>
            <Link className="btn" href="/#work">
              Jump straight to the work
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
