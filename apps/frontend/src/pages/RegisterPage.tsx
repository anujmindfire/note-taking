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
import { useRegister } from "@/hooks/useRegister";
import { useLogin } from "@/hooks/useLogin";
import { registerSchema } from "@noteapp/shared";
import type { TRegisterInput } from "@noteapp/shared";

export function RegisterPage() {
  const registerMutation = useRegister();
  const loginMutation = useLogin();

  const { register, handleSubmit } = useForm<TRegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  function onInvalid(errors: FieldErrors<TRegisterInput>) {
    const first = Object.values(errors)[0];
    toast.error(first?.message ?? "Please check your input");
  }

  function onSubmit(data: TRegisterInput) {
    registerMutation.mutate(data, {
      onSuccess: () => {
        loginMutation.mutate({
          email: data.email,
          password: data.password,
        });
      },
    });
  }

  const isPending = registerMutation.isPending || loginMutation.isPending;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Create account</CardTitle>
          <CardDescription>
            Sign up to start using Note.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form noValidate onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-4">
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
                placeholder="Min 8 chars, uppercase, lowercase, digit"
                {...register("password")}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isPending}
            >
              {isPending ? "Creating account…" : "Create account"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
