import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function useUser() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const profile = useQuery(api.auth.current, isAuthenticated ? {} : "skip");
  return {
    isLoaded: !isLoading && (!isAuthenticated || profile !== undefined),
    user: isAuthenticated && profile ? { id: profile.subject, ...profile } : null,
  };
}

export function useAuth() {
  const { isLoaded, user } = useUser();
  return { isLoaded, userId: user?.id ?? null };
}

export function UserMenu() {
  const { user } = useUser();
  const { signOut } = useAuthActions();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;

  async function handleSignOut() {
    setError(null);
    setIsSigningOut(true);
    try {
      await signOut();
      window.location.assign("/sign-in");
    } catch {
      setError("Could not sign out. Try again.");
      setIsSigningOut(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex h-8 w-8 items-center justify-center border-2 border-[#1a1a1a] font-mono text-sm font-bold text-[#1a1a1a]"
        >
          {user.name.slice(0, 1).toUpperCase()}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
        <div className="px-2 pb-2 text-sm text-[#555]">{user.email}</div>
        <DropdownMenuSeparator />
        {error && (
          <p role="alert" className="max-w-64 px-2 py-1 text-sm text-red-700">
            {error}
          </p>
        )}
        <DropdownMenuItem disabled={isSigningOut} onSelect={() => void handleSignOut()}>
          {isSigningOut ? "Signing out..." : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
