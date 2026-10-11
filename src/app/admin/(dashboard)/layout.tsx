import { checkAdminAuth } from "@/lib/admin-auth";
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { signOutAction } from "../actions";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const authResult = await checkAdminAuth();

  if (authResult.status === "unauthenticated") {
    redirect("/admin/login");
  }

  if (authResult.status === "forbidden") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-bold text-slate-800 mb-2">Access denied</h1>
          <p className="text-sm text-slate-500 mb-4">
            You&apos;re signed in, but your account doesn&apos;t have administrator access. Ask an existing
            administrator to add your account, or sign out and use a different one.
          </p>
          <form action={signOutAction}>
            <button
              type="submit"
              className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      <AdminSidebar email={authResult.email} />
      <main className="flex-1 px-4 py-5 sm:px-6 sm:py-8 max-w-5xl mx-auto w-full">{children}</main>
    </div>
  );
}
