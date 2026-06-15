import { useState } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForgotPassword } from "@/hooks/useForgotPassword";
import { useResetPassword } from "@/hooks/useResetPassword";
import { forgotPasswordSchema, resetPasswordSchema } from "@noteapp/shared";
import type { TForgotPasswordInput } from "@noteapp/shared";

const step2Schema = resetPasswordSchema.pick({ otp: true, newPassword: true });
type TStep2Input = { otp: string; newPassword: string };

interface ForgotPasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ForgotPasswordModal({
  open,
  onOpenChange,
}: ForgotPasswordModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const forgotMutation = useForgotPassword();
  const resetMutation = useResetPassword();

  const step1Form = useForm<TForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const step2Form = useForm<TStep2Input>({
    resolver: zodResolver(step2Schema),
  });

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setStep(1);
      setSubmittedEmail("");
      step1Form.reset();
      step2Form.reset();
    }
    onOpenChange(nextOpen);
  }

  function onInvalid(errors: FieldErrors<TForgotPasswordInput> | FieldErrors<TStep2Input>) {
    const first = Object.values(errors)[0];
    toast.error((first as { message?: string })?.message ?? "Please check your input");
  }

  function onStep1Submit(data: TForgotPasswordInput) {
    forgotMutation.mutate(data, {
      onSuccess: () => {
        setSubmittedEmail(data.email);
        setStep(2);
      },
    });
  }

  function onStep2Submit(data: TStep2Input) {
    resetMutation.mutate(
      { email: submittedEmail, otp: data.otp, newPassword: data.newPassword },
      {
        onSuccess: () => {
          toast.success("Password reset successfully. Please log in.");
          handleOpenChange(false);
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "Forgot password" : "Reset password"}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Enter your email and we'll send a one-time code."
              : "Enter the 6-digit code and your new password."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <form noValidate onSubmit={step1Form.handleSubmit(onStep1Submit, onInvalid)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                placeholder="you@example.com"
                {...step1Form.register("email")}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={forgotMutation.isPending}
            >
              {forgotMutation.isPending ? "Sending…" : "Send code"}
            </Button>
          </form>
        ) : (
          <form onSubmit={step2Form.handleSubmit(onStep2Submit, onInvalid)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="otp">One-time code</Label>
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                {...step2Form.register("otp")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Min 8 chars, uppercase, lowercase, digit"
                {...step2Form.register("newPassword")}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? "Resetting…" : "Reset password"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
