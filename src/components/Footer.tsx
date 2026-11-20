export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="wrap">
        <span>
          &copy; {year} Ramakrishna. Built by hand with Next.js and plain CSS.
        </span>
        <span className="footer-links">
          <a
            href="https://github.com/rvramakrishna7"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <span aria-hidden="true">&middot;</span>
          <a
            href="https://www.linkedin.com/in/rvramakrishna"
            target="_blank"
            rel="noopener noreferrer"
          >
            LinkedIn
          </a>
        </span>
      </div>
    </footer>
  );
}
