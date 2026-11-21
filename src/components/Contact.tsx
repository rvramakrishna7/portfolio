import { ContactForm } from "@/components/ContactForm";

export function Contact() {
  return (
    <section className="block" id="contact" aria-labelledby="contact-title">
      <div className="wrap contact">
        <div>
          <p className="eyebrow">Contact</p>
          <h2 id="contact-title">Have a problem worth solving?</h2>
          <p className="sub-text">
            I&apos;m open to software engineering opportunities. Tell me about
            your team, the role or the problem you&apos;re working on.
          </p>

          <a
            className="big-link"
            href="https://www.linkedin.com/in/rvramakrishna"
            rel="noopener noreferrer"
            target="_blank"
          >
            LinkedIn &rarr;
          </a>
          <a
            className="big-link"
            href="https://github.com/rvramakrishna7"
            rel="noopener noreferrer"
            target="_blank"
          >
            GitHub &rarr;
          </a>
          <a
            className="big-link"
            href="/resume.pdf"
            download="Ramakrishna-Resume.pdf"
          >
            Download resume &rarr;
          </a>
        </div>

        <ContactForm />
      </div>
    </section>
  );
}
