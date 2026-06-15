import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";
import { ForgotPasswordModal } from "../../components/ForgotPasswordModal";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from "sonner";

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

function renderModal(onOpenChange: (open: boolean) => void = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ForgotPasswordModal open={true} onOpenChange={onOpenChange} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * Advances the modal from Step 1 to Step 2 by entering an email and submitting.
 * Uses fireEvent to bypass jsdom pointer-events restrictions from Radix Dialog.
 */
async function advanceToStep2() {
  const emailInput = screen.getByLabelText(/email/i);
  fireEvent.change(emailInput, { target: { value: "test@example.com" } });

  const sendCodeButton = screen.getByRole("button", { name: /send code/i });
  fireEvent.click(sendCodeButton);

  // Wait for step 2 to appear
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: /reset password/i })).toBeInTheDocument();
  });
}

describe("ForgotPasswordModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC-S10: valid email submitted in Step 1 calls forgot-password API and advances to Step 2", async () => {
    const user = userEvent.setup();
    renderModal();

    // Step 1 should be visible
    expect(screen.getByRole("heading", { name: /forgot password/i })).toBeInTheDocument();
    expect(
      screen.getByText("Enter your email and we'll send a one-time code.")
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/email/i), "test@example.com");
    await user.click(screen.getByRole("button", { name: /send code/i }));

    // Step 2 content should appear after the mutation resolves
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /reset password/i })).toBeInTheDocument();
    });
    expect(
      screen.getByText("Enter the 6-digit code and your new password.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/one-time code/i)).toBeInTheDocument();
  });

  it("AC-S11: invalid email format in Step 1 does not call the API, stays on Step 1", async () => {
    const user = userEvent.setup();
    let apiCalled = false;
    server.use(
      http.post("/api/auth/forgot-password", () => {
        apiCalled = true;
        return HttpResponse.json({ data: { message: "OTP sent" } }, { status: 200 });
      })
    );

    renderModal();

    // Type an invalid email (no @)
    await user.type(screen.getByLabelText(/email/i), "invalidemail");
    await user.click(screen.getByRole("button", { name: /send code/i }));

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(apiCalled).toBe(false);
    expect(toast.error).toHaveBeenCalled();
    // Should still be on Step 1
    expect(screen.getByRole("heading", { name: /forgot password/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /reset password/i })).not.toBeInTheDocument();
  });

  it("AC-S12: completing Step 2 with valid OTP and strong password calls reset-password API and closes modal", async () => {
    const onOpenChange = vi.fn();
    renderModal(onOpenChange);

    // Advance to Step 2 via fireEvent (bypasses Radix pointer-events: none on body)
    await advanceToStep2();

    // Fill and submit Step 2 form via fireEvent
    fireEvent.change(screen.getByLabelText(/one-time code/i), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "NewPassword1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "Password reset successfully. Please log in."
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("AC-S13: OTP expired on Step 2 shows toast.error and stays on Step 2", async () => {
    renderModal();

    // Advance to Step 2
    await advanceToStep2();

    // Override reset-password to return 410 OTP_EXPIRED
    server.use(
      http.post("/api/auth/reset-password", () =>
        HttpResponse.json(
          {
            error: {
              code: "OTP_EXPIRED",
              message: "OTP expired",
            },
          },
          { status: 410 }
        )
      )
    );

    fireEvent.change(screen.getByLabelText(/one-time code/i), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "NewPassword1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("OTP expired");
    });
    // Step 2 should still be visible
    expect(screen.getByRole("heading", { name: /reset password/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/one-time code/i)).toBeInTheDocument();
  });

  it("AC-S14: OTP invalid on Step 2 shows toast.error and stays on Step 2", async () => {
    renderModal();

    // Advance to Step 2
    await advanceToStep2();

    // Override reset-password to return 400 OTP_INVALID
    server.use(
      http.post("/api/auth/reset-password", () =>
        HttpResponse.json(
          {
            error: {
              code: "OTP_INVALID",
              message: "OTP invalid",
            },
          },
          { status: 400 }
        )
      )
    );

    fireEvent.change(screen.getByLabelText(/one-time code/i), {
      target: { value: "000000" },
    });
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "NewPassword1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("OTP invalid");
    });
    // Step 2 should still be visible
    expect(screen.getByRole("heading", { name: /reset password/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/one-time code/i)).toBeInTheDocument();
  });

  it("AC-S15: weak password in Step 2 does not call the reset-password API, stays on Step 2", async () => {
    let apiCalled = false;
    renderModal();

    // Advance to Step 2
    await advanceToStep2();

    // Track whether reset-password is called
    server.use(
      http.post("/api/auth/reset-password", () => {
        apiCalled = true;
        return HttpResponse.json({ data: { message: "Password reset" } }, { status: 200 });
      })
    );

    // Password without uppercase — Zod should block this
    fireEvent.change(screen.getByLabelText(/one-time code/i), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "weakpassword1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(apiCalled).toBe(false);
    expect(toast.error).toHaveBeenCalled();
    // Step 2 should still be visible
    expect(screen.getByRole("heading", { name: /reset password/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/one-time code/i)).toBeInTheDocument();
  });
});
