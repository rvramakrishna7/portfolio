import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";

export function Contact() {
  return (
    <section className="block" id="contact" aria-labelledby="contact-title">
      <div className="wrap contact">
        <div>
          <p className="eyebrow">Contact</p>
          <h2 id="contact-title">Got a role, or a hard problem?</h2>
          <p className="sub-text">
            Send a message and it lands straight in my inbox. I reply fast.
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
          <Link className="big-link" href="/resume.pdf">
            Resume (PDF) &rarr;
          </Link>
        </div>

        <ContactForm />
      </div>
    </section>
  );
}
