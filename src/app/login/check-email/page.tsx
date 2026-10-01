import Link from "next/link";

export const metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <>
      <div className="card w-full max-w-sm p-6 text-center">
        <h1 className="text-lg font-semibold">Check your email</h1>
        <p className="mt-2 text-sm text-slate-600">
          If your address is registered, we've sent you a sign-in link. It expires in 15 minutes.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm link">
          Back to sign in
        </Link>
      </div>
    </>
  );
}
