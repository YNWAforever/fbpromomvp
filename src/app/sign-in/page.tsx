import { signIn } from "../../../auth";

type SignInPageProps = {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
};

function errorMessage(error: string | undefined): string | null {
  if (!error) return null;
  if (error === "AccessDenied") {
    return "This Google account is not authorised for the staff dashboard.";
  }
  return "We could not sign you in. Please try again or contact an administrator.";
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const message = errorMessage(params.error);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16 text-slate-100">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">
          Off-Peak Rescue
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Staff sign-in</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Use your approved Google workspace account to access venue operations.
        </p>

        {message ? (
          <p className="mt-6 rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {message}
          </p>
        ) : null}

        <form
          className="mt-8"
          action={async () => {
            "use server";
            await signIn("google", {
              redirectTo: params.callbackUrl || "/dashboard",
            });
          }}
        >
          <button
            className="w-full rounded-lg bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 focus:ring-offset-slate-900"
            type="submit"
          >
            Continue with Google
          </button>
        </form>
      </section>
    </main>
  );
}
