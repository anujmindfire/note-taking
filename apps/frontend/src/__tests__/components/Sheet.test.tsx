import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";

describe("Sheet", () => {
  it("Sheet renders open with title visible", () => {
    render(
      <Sheet open={true}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Test Sheet Title</SheetTitle>
          </SheetHeader>
          <p>Sheet body content</p>
        </SheetContent>
      </Sheet>
    );

    expect(screen.getByText("Test Sheet Title")).toBeInTheDocument();
    expect(screen.getByText("Sheet body content")).toBeInTheDocument();
  });

  it("Sheet renders closed — content is not visible", () => {
    render(
      <Sheet open={false}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Hidden Title</SheetTitle>
          </SheetHeader>
          <p>Hidden body content</p>
        </SheetContent>
      </Sheet>
    );

    expect(screen.queryByText("Hidden Title")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden body content")).not.toBeInTheDocument();
  });

  it("Close button with sr-only 'Close' text is present when open", () => {
    render(
      <Sheet open={true}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Closeable Sheet</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );

    // The SheetContent renders a SheetClose with an sr-only "Close" span
    expect(screen.getByText("Close")).toBeInTheDocument();
  });
});
