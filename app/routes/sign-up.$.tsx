import { createFileRoute } from "@tanstack/react-router";
import { ConvexClientProvider } from "@/lib/convex";
import { AuthShell } from "./auth/-layout";
import SignUpPage from "./auth/-sign-up";

export const Route = createFileRoute("/sign-up/$")({
  component: SignUpRoute,
});

function SignUpRoute() {
  return (
    <ConvexClientProvider>
      <AuthShell>
        <SignUpPage />
      </AuthShell>
    </ConvexClientProvider>
  );
}
