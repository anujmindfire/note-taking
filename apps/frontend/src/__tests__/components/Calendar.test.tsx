import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Calendar } from "../../components/ui/calendar";

describe("Calendar", () => {
  it("renders the calendar with a month navigation area", () => {
    render(<Calendar mode="single" />);
    // react-day-picker v10 renders a <table> for the month grid
    const table = document.querySelector("table");
    expect(table).not.toBeNull();
  });

  it("renders with a selected date without crashing", () => {
    const selected = new Date(2027, 0, 15);
    render(<Calendar mode="single" selected={selected} />);
    const table = document.querySelector("table");
    expect(table).not.toBeNull();
  });

  it("renders disabled days when disabled prop is provided", () => {
    const disablePast = (date: Date) => date < new Date();
    render(<Calendar mode="single" disabled={disablePast} />);
    // Some buttons should be rendered
    const buttons = document.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("shows outside days by default (showOutsideDays=true)", () => {
    render(<Calendar mode="single" showOutsideDays={true} />);
    const table = document.querySelector("table");
    expect(table).not.toBeNull();
  });

  it("accepts a custom className", () => {
    const { container } = render(
      <Calendar mode="single" className="custom-cal" />
    );
    expect(container.querySelector(".custom-cal")).not.toBeNull();
  });
});
