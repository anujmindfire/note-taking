import { useAuthStore } from "@/stores/authStore";
import { useLogout } from "@/hooks/useLogout";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const user = useAuthStore((s) => s.user);
  const logoutMutation = useLogout();

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center border-b bg-background px-6">
      <span className="text-lg font-semibold tracking-tight">Note</span>
      <div className="ml-auto flex items-center gap-4">
        {user && (
          <span className="text-sm text-muted-foreground">{user.email}</span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          {logoutMutation.isPending ? "Logging out…" : "Logout"}
        </Button>
      </div>
    </header>
  );
}
