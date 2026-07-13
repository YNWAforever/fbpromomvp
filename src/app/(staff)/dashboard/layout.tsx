import { redirect } from "next/navigation";
import { signOut } from "../../../../auth";
import { requireStaff, StaffAccessDeniedError } from "@/lib/auth/require-staff";

const navigation = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/venues", label: "Venues" },
  { href: "/dashboard/promotions", label: "Promotions" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/operations", label: "Operations" },
];

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let staff;
  try {
    staff = await requireStaff();
  } catch (error) {
    if (error instanceof StaffAccessDeniedError) {
      redirect("/sign-in?error=AccessDenied");
    }
    throw error;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <aside className="border-b border-slate-800 px-6 py-6 lg:w-64 lg:border-b-0 lg:border-r">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-300">Off-Peak Rescue</p>
            <p className="mt-2 text-sm text-slate-400">Staff operations</p>
          </div>
          <nav aria-label="Staff navigation" className="mt-8 flex gap-2 overflow-x-auto lg:flex-col">
            {navigation.map((item) => (
              <a
                key={item.href}
                className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
                href={item.href}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="mt-8 border-t border-slate-800 pt-6">
            <p className="truncate text-sm font-medium text-slate-100">{staff.name}</p>
            <p className="mt-1 truncate text-xs text-slate-400">{staff.email}</p>
            <form
              className="mt-4"
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/sign-in" });
              }}
            >
              <button className="text-xs font-medium text-slate-400 underline-offset-4 hover:text-white hover:underline" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-6 py-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
