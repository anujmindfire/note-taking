import { useState } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ForgotPasswordModal } from "@/components/ForgotPasswordModal";
import { useLogin } from "@/hooks/useLogin";
import { loginSchema } from "@noteapp/shared";
import type { TLoginInput } from "@noteapp/shared";

export function LoginPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const loginMutation = useLogin();

  const { register, handleSubmit } = useForm<TLoginInput>({
    resolver: zodResolver(loginSchema),
  });

  function onSubmit(data: TLoginInput) {
    loginMutation.mutate(data);
  }

  function onInvalid(errors: FieldErrors<TLoginInput>) {
    const first = Object.values(errors)[0];
    toast.error(first?.message ?? "Please check your input");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>
            Enter your email and password to access JotDown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                {...register("email")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register("password")}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Forgot password?
            </button>
          </div>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              to="/register"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Register
            </Link>
          </p>
        </CardFooter>
      </Card>

      <ForgotPasswordModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
