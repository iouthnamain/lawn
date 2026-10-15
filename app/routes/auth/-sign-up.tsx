import { Link } from "@tanstack/react-router";

export default function SignUpPage() {
  return (
    <div className="space-y-4 border-2 border-[#1a1a1a] bg-[#f0f0e8] p-6 shadow-[8px_8px_0px_0px_var(--shadow-color)]">
      <h1 className="font-mono text-2xl font-black tracking-tight text-[#1a1a1a] uppercase">
        Account access
      </h1>
      <p className="text-sm text-[#555]">
        This Lawn server uses local accounts. Ask your operator to create an account with your email
        address.
      </p>
      <p className="text-sm text-[#555]">
        For a team invitation, use the account matching the invited email. Your operator can also
        reset a forgotten password.
      </p>
      <Link
        to="/sign-in"
        className="inline-block border-2 border-[#1a1a1a] bg-[#1a1a1a] px-4 py-2 font-mono text-sm font-bold text-[#f0f0e8]"
      >
        Sign in
      </Link>
    </div>
  );
}
