import type { ReactNode } from "react";
import { AdminTopBar } from "@/components/admin/admin-top-bar";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <AdminTopBar />
      {children}
    </div>
  );
}
