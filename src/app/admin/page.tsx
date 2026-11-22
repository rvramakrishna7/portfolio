import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin/require-admin";
import { AdminDashboard } from "./AdminDashboard";

export const metadata: Metadata = {
  title: "Job Desk | Ramakrishna",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminPage() {
  // Defense in depth: Verify session directly in the server component
  await requireAdminPage();

  return <AdminDashboard />;
}
