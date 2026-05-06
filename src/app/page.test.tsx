import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders URL input and generate action", () => {
    render(<HomePage />);

    expect(screen.getByLabelText(/website url/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /generate/i })
    ).toBeInTheDocument();
  });
});
