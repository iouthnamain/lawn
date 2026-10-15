import { useAuthActions } from "@convex-dev/auth/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const { user } = useUser();
  const search = useRouterState({ select: (state) => state.location.searchStr });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function redirectAfterSignIn() {
    const requested = new URLSearchParams(search).get("redirect_url");
    const fallback = "/dashboard";
    try {
      const target = new URL(requested || fallback, window.location.origin);
      const safe =
        target.origin === window.location.origin && !target.pathname.startsWith("/sign-");
      window.location.assign(safe ? `${target.pathname}${target.search}${target.hash}` : fallback);
    } catch {
      window.location.assign(fallback);
    }
  }

  useEffect(() => {
    if (user) redirectAfterSignIn();
  }, [user, search]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await signIn("password", { email: email.trim().toLowerCase(), password, flow: "signIn" });
      redirectAfterSignIn();
    } catch {
      setError("Could not sign in. Check your email and password, then try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 border-2 border-[#1a1a1a] bg-[#f0f0e8] p-6 shadow-[8px_8px_0px_0px_var(--shadow-color)]"
    >
      <div>
        <h1 className="font-mono text-2xl font-black tracking-tight text-[#1a1a1a] uppercase">
          Sign in
        </h1>
        <p className="mt-2 text-sm text-[#555]">Use your local Lawn account.</p>
      </div>
      <div className="space-y-2">
        <label htmlFor="email" className="font-mono text-sm font-bold text-[#1a1a1a]">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={isSubmitting}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="font-mono text-sm font-bold text-[#1a1a1a]">
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={isSubmitting}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Signing in..." : "Sign in"}
      </Button>
      <p className="text-sm text-[#555]">
        Need an account or password reset? Contact your Lawn operator.{" "}
        <Link to="/sign-up" className="font-bold text-[#2d5a2d] underline">
          Account access
        </Link>
      </p>
    </form>
  );
}
