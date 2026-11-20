import Link from "next/link";

export default function NotAllowedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8">
        <h1 className="text-[22px] font-semibold">You are not on the list</h1>
        <p className="mt-2 text-muted">
          This tool is only for the All In Capital team. If you should have access, ask the admin to add your email.
        </p>
        <Link href="/login" className="mt-6 inline-block text-accent underline">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
