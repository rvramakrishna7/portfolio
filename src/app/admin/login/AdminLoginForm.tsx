"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        router.push("/admin");
        router.refresh();
      } else if (res.status === 429) {
        setError(data?.error || "Too many failed attempts. Try again later.");
      } else if (res.status === 503) {
        setError("Admin authentication service unavailable.");
      } else {
        setError(data?.error || "Wrong password");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="admin-card-form" onSubmit={handleSubmit} noValidate>
      <div className="form-field">
        <label htmlFor="admin-password">Password</label>
        <input
          id="admin-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "admin-login-error" : undefined}
        />
        {error ? (
          <p id="admin-login-error" className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <button
        className="btn primary admin-submit"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
