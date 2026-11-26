"use client";

import { useState } from "react";

interface Contact {
  email: string;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  confidence: number | null;
  verification?: string | null;
  sources?: number;
}

type Verification = { status: string; score: number | null };

interface Props {
  jobId: string;
  company: string;
  postingEmail?: string | null;
  // Called with a checked contact. Returns a message to show the owner (for example "Added to your draft").
  onUse: (jobId: string, contact: { email: string; name: string | null; linkedinUrl: string | null }) => Promise<string>;
}

const LINKEDIN_PEOPLE =
  "https://www.linkedin.com/search/results/people/?origin=GLOBAL_SEARCH_HEADER&keywords=";

const STATUS_TEXT: Record<string, string> = {
  valid: "Verified",
  accept_all: "This company's mail server accepts any address, so nobody can confirm it",
  invalid: "Invalid, do not send",
  webmail: "Personal webmail address",
  disposable: "Disposable address, do not send",
  unknown: "Could not verify",
};

async function post(body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch("/api/admin/contacts/find", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

export default function ContactFinder({ jobId, company, postingEmail, onUse }: Props) {
  const [open, setOpen] = useState(false);
  const [domain, setDomain] = useState("");
  const [fullName, setFullName] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [checked, setChecked] = useState<Record<string, Verification>>({});
  // An address nobody can confirm. Needs a second, deliberate click.
  const [risky, setRisky] = useState<{ email: string; name: string | null; why: string } | null>(null);

  const linkedinHref = `${LINKEDIN_PEOPLE}${encodeURIComponent(`recruiter ${company}`)}`;

  function noteCredits(data: Record<string, unknown>) {
    if (typeof data.creditsLeft === "number") setCredits(data.creditsLeft);
  }

  async function searchCompany() {
    setBusy("company");
    setError(null);
    setMessage(null);
    const r = await post({ action: "company", domain });
    setBusy(null);
    if (!r.ok) return setError(String(r.data.error || "Search failed"));
    noteCredits(r.data);
    const found = (r.data.contacts as Contact[]) || [];
    setContacts(found);
    if (found.length === 0) setMessage("No public recruiter or HR emails found for this company. Try the LinkedIn route below.");
  }

  async function searchPerson() {
    setBusy("person");
    setError(null);
    setMessage(null);
    const r = await post({ action: "person", domain, fullName, linkedinUrl });
    setBusy(null);
    if (!r.ok) return setError(String(r.data.error || "Search failed"));
    noteCredits(r.data);
    const found = (r.data.contacts as Contact[]) || [];
    setContacts(found);
    if (found.length === 0) setMessage("Hunter has no email for that person.");
  }

  // Checks the address first so a bad one never reaches the draft and hurts the Gmail sender reputation.
  async function chooseContact(email: string, name: string | null, trusted = false, known?: Contact, force = false) {
    setBusy(email);
    setError(null);
    setMessage(null);
    setRisky(null);
    if (!trusted && !force) {
      let status = known?.verification === "valid" ? "valid" : null;
      if (!status) {
        const r = await post({ action: "verify", email });
        if (!r.ok) {
          setBusy(null);
          return setError(String(r.data.error || "Could not verify this email"));
        }
        noteCredits(r.data);
        const v = r.data.verification as Verification;
        setChecked((prev) => ({ ...prev, [email]: v }));
        status = v.status;
      }
      // Only a confirmed address goes into a draft. A catch-all or unknown result often means the mail bounces later.
      if (status !== "valid") {
        setBusy(null);
        if (status === "invalid" || status === "disposable") {
          return setError(`${email}: ${STATUS_TEXT[status]}. Not added.`);
        }
        const seen = known?.sources ?? 0;
        return setRisky({
          email,
          name,
          why: `${STATUS_TEXT[status] || "Could not be confirmed"}. ${
            seen > 0
              ? `It was found on ${seen} public web page${seen === 1 ? "" : "s"}, which is a good sign.`
              : "It was not found on any public web page, so it may be a pattern guess. Mail to it can bounce."
          }`,
        });
      }
    }
    const li = linkedinUrl.trim();
    const note = await onUse(jobId, {
      email,
      name,
      linkedinUrl: /^https:\/\/([a-z0-9-]+\.)?linkedin\.com\/in\//i.test(li) ? li : null,
    });
    setBusy(null);
    setMessage(note);
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn ghost btn-sm admin-find-contact-btn"
        onClick={() => setOpen(true)}
        aria-expanded={false}
      >
        Find contact
      </button>
    );
  }

  const personLabel = (c: Contact) => [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email;

  return (
    <div className="admin-contact-panel" aria-label={`Find a recruiter for ${company}`}>
      <div className="admin-contact-head">
        <strong>Find a recruiter or hiring manager at {company}</strong>
        <button type="button" className="btn ghost btn-sm" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      {postingEmail && (
        <div className="admin-contact-row">
          <div className="admin-contact-who">
            <span className="admin-contact-email">{postingEmail}</span>
            <span className="admin-contact-role">Listed in the posting itself</span>
          </div>
          <button
            type="button"
            className="btn primary btn-sm"
            disabled={busy !== null}
            onClick={() => chooseContact(postingEmail, null, true)}
          >
            {busy === postingEmail ? "Adding..." : "Use for outreach"}
          </button>
        </div>
      )}

      <div className="admin-contact-grid">
        <div className="admin-input-group">
          <label htmlFor={`cf-domain-${jobId}`}>Company website</label>
          <input
            id={`cf-domain-${jobId}`}
            className="admin-input"
            placeholder="saraswati.ai"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="admin-contact-actions">
          <button
            type="button"
            className="btn primary btn-sm"
            disabled={busy !== null || domain.trim().length < 3}
            onClick={searchCompany}
          >
            {busy === "company" ? "Searching..." : "Search with Hunter"}
          </button>
        </div>
      </div>

      <div className="admin-contact-linkedin">
        <p className="admin-contact-hint">
          Know the person? Open LinkedIn in your own browser, pick the recruiter or hiring manager, then paste their name or profile link here.
        </p>
        <a className="btn ghost btn-sm" href={linkedinHref} target="_blank" rel="noopener noreferrer">
          Find on LinkedIn ↗
        </a>
        <div className="admin-contact-grid">
          <div className="admin-input-group">
            <label htmlFor={`cf-name-${jobId}`}>Full name</label>
            <input
              id={`cf-name-${jobId}`}
              className="admin-input"
              placeholder="Jane Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="admin-input-group">
            <label htmlFor={`cf-li-${jobId}`}>or LinkedIn profile link</label>
            <input
              id={`cf-li-${jobId}`}
              className="admin-input"
              placeholder="linkedin.com/in/jane-doe"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
        <button
          type="button"
          className="btn ghost btn-sm"
          disabled={busy !== null || domain.trim().length < 3 || (!fullName.trim() && !linkedinUrl.trim())}
          onClick={searchPerson}
        >
          {busy === "person" ? "Finding..." : "Find this person's email"}
        </button>
        {domain.trim().length < 3 && (
          <p className="admin-contact-hint">Enter the company website above first. Hunter needs it to find a person.</p>
        )}
      </div>

      {contacts.length > 0 && (
        <ul className="admin-contact-list">
          {contacts.map((c) => (
            <li key={c.email} className="admin-contact-row">
              <div className="admin-contact-who">
                <span className="admin-contact-name">{personLabel(c)}</span>
                <span className="admin-contact-role">
                  {c.position || "Role not listed"}
                  {c.confidence !== null ? ` · confidence ${c.confidence}%` : ""}
                </span>
                <span className="admin-contact-email">{c.email}</span>
                {c.sources !== undefined && (
                  <span className="admin-contact-status">
                    {c.sources > 0
                      ? `Seen on ${c.sources} public web page${c.sources === 1 ? "" : "s"}`
                      : "Not seen on the web (pattern guess)"}
                    {c.verification === "valid" ? " · Hunter says valid" : ""}
                  </span>
                )}
                {checked[c.email] && (
                  <span className={`admin-contact-status ${checked[c.email].status}`}>
                    {STATUS_TEXT[checked[c.email].status] || checked[c.email].status}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="btn primary btn-sm"
                disabled={busy !== null}
                onClick={() =>
                  chooseContact(c.email, personLabel(c) === c.email ? fullName.trim() || null : personLabel(c), false, c)
                }
              >
                {busy === c.email ? "Checking..." : "Verify and use"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {risky && (
        <div className="admin-contact-risky" role="alert">
          <p>
            <strong>{risky.email}</strong> is not confirmed. {risky.why}
          </p>
          <button
            type="button"
            className="btn ghost btn-sm"
            disabled={busy !== null}
            onClick={() => chooseContact(risky.email, risky.name, false, undefined, true)}
          >
            Use anyway
          </button>
          <button type="button" className="btn ghost btn-sm" onClick={() => setRisky(null)}>
            Do not use
          </button>
        </div>
      )}

      {error && (
        <p className="admin-contact-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="admin-contact-ok" role="status">
          {message}
        </p>
      )}
      {credits !== null && <p className="admin-contact-hint">Hunter credits left this month: {credits}</p>}
    </div>
  );
}
