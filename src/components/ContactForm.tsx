"use client";

import { useState } from "react";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [statusType, setStatusType] = useState<"ok" | "err" | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatusMessage("");
    setStatusType("");
    setFieldErrors({});

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          message,
          website,
        }),
      });

      const data = await response.json().catch(() => null);

      if (response.ok && data?.success) {
        setStatusMessage(
          "Thanks. Your message is on its way, and I'll reply soon."
        );
        setStatusType("ok");
        setName("");
        setEmail("");
        setMessage("");
        setWebsite("");
      } else if (response.status === 400 && data?.errors) {
        setFieldErrors(data.errors);
      } else {
        setStatusMessage(
          "That did not send. Please try again, or message me on LinkedIn."
        );
        setStatusType("err");
      }
    } catch {
      setStatusMessage(
        "That did not send. Please try again, or message me on LinkedIn."
      );
      setStatusType("err");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="contact-form" onSubmit={handleSubmit} noValidate>
      {/* Honeypot field (hidden off-screen for bots) */}
      <div className="hp-field" aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label htmlFor="contact-name">Your name</label>
        <input
          id="contact-name"
          name="name"
          type="text"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? "name-error" : undefined}
        />
        {fieldErrors.name ? (
          <p id="name-error" className="field-error" role="alert">
            {fieldErrors.name}
          </p>
        ) : null}
      </div>

      <div className="form-field">
        <label htmlFor="contact-email">Your email</label>
        <input
          id="contact-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
        />
        {fieldErrors.email ? (
          <p id="email-error" className="field-error" role="alert">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className="form-field">
        <label htmlFor="contact-message">Message</label>
        <textarea
          id="contact-message"
          name="message"
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-invalid={Boolean(fieldErrors.message)}
          aria-describedby={fieldErrors.message ? "message-error" : undefined}
        />
        {fieldErrors.message ? (
          <p id="message-error" className="field-error" role="alert">
            {fieldErrors.message}
          </p>
        ) : null}
      </div>

      <button className="btn primary" type="submit" disabled={isSubmitting}>
        Send message
      </button>

      <p
        id="form-status"
        role="status"
        aria-live="polite"
        className={`form-status ${statusType}`}
      >
        {statusMessage}
      </p>

      <p className="form-note">I only use your details to reply to you.</p>
    </form>
  );
}
