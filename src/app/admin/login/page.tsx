import type { Metadata } from "next";
import { AdminLoginForm } from "./AdminLoginForm";

export const metadata: Metadata = {
  title: "Admin Login | Ramakrishna",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLoginPage() {
  return (
    <main id="main" className="admin-login-layout">
      <div className="admin-card-container">
        <div className="admin-header-badge">Owner Area</div>
        <h1>Sign in to Job Desk</h1>
        <p className="admin-login-subtitle">
          Private dashboard for job applications, outreach, and portfolio telemetry.
        </p>
        <AdminLoginForm />
      </div>
    </main>
  );
}
