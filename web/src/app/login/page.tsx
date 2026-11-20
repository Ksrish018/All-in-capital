import { SignInButton } from "./sign-in-button";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8">
        <h1 className="text-[22px] font-semibold">All In Capital Triage</h1>
        <p className="mt-2 text-muted">Sign in with your fund Google account. Only people on the fund&apos;s list can enter.</p>
        {error ? (
          <p className="mt-4 rounded border border-flag/40 bg-flag/10 px-3 py-2 text-flag">
            Sign in did not finish. Please try again.
          </p>
        ) : null}
        <div className="mt-6">
          <SignInButton />
        </div>
      </div>
    </main>
  );
}
