"use client";

import { useState } from "react";

interface Result {
  question: string;
  answer?: string;
  error?: string;
}

const WORD_OPTIONS = [60, 100, 150, 200];

export default function AnswerStudio() {
  const [description, setDescription] = useState("");
  const [questionsText, setQuestionsText] = useState("");
  const [maxWords, setMaxWords] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [copied, setCopied] = useState<number | null>(null);

  // Questions are separated by a blank line. A question may run over several lines (for example a hint line).
  // With no blank lines at all, every line is its own question.
  const blocks = questionsText
    .split(/\n\s*\n/)
    .map((q) => q.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  const questions = blocks.length > 1 || !/\n/.test(questionsText.trim()) ? blocks : questionsText.split("\n").map((q) => q.trim()).filter(Boolean);

  async function generate() {
    setBusy(true);
    setError(null);
    setResults([]);
    try {
      const res = await fetch("/api/admin/answers/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, questions, maxWords }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not write the answers");
      setResults(data.answers as Result[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not write the answers");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Could not copy. Allow clipboard access and try again.");
    }
  }

  return (
    <div className="admin-answer-studio" aria-label="Answer questions from a job description">
      <label className="admin-studio-label" htmlFor="studio-description">
        Job description
      </label>
      <textarea
        id="studio-description"
        className="admin-studio-textarea"
        rows={8}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Paste the full job description here"
      />

      <label className="admin-studio-label" htmlFor="studio-questions">
        Questions (separate each with a blank line, up to 5)
      </label>
      <textarea
        id="studio-questions"
        className="admin-studio-textarea"
        rows={4}
        value={questionsText}
        onChange={(e) => setQuestionsText(e.target.value)}
        placeholder={"Why do you want to work here?\nTell us about a project you are proud of"}
      />

      <div className="admin-studio-row">
        <label htmlFor="studio-words">Length</label>
        <select id="studio-words" value={maxWords} onChange={(e) => setMaxWords(Number(e.target.value))}>
          {WORD_OPTIONS.map((n) => (
            <option key={n} value={n}>
              Up to {n} words
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn primary btn-sm"
          disabled={busy || description.trim().length < 20 || questions.length === 0 || questions.length > 5}
          onClick={generate}
        >
          {busy ? "Writing answers..." : "Write answers"}
        </button>
      </div>

      <p className="admin-studio-hint">
        {questions.length === 0
          ? "Add at least one question."
          : questions.length > 5
          ? `${questions.length} questions found. The limit is 5 at a time, remove some.`
          : `${questions.length} question${questions.length === 1 ? "" : "s"} found.`}
      </p>

      {error && (
        <p className="admin-contact-error" role="alert">
          {error}
        </p>
      )}

      {results.map((r, i) => (
        <div key={i} className="admin-studio-result">
          <h3>{r.question}</h3>
          {r.answer ? (
            <>
              <p>{r.answer}</p>
              <button type="button" className="btn ghost btn-sm" onClick={() => copy(r.answer as string, i)}>
                {copied === i ? "Copied" : "Copy answer"}
              </button>
            </>
          ) : (
            <p className="admin-contact-error">{r.error}</p>
          )}
        </div>
      ))}
    </div>
  );
}
