import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { Card } from "../types";
import { FootPreview } from "./FootPreview";

const card: Card = {
  id: "foot-top",
  rank: "10",
  suit: "diamonds",
  value: 10,
  wild: false,
  redThree: false,
};

it("shows only a colored rank on the stack and reveals the full card on hover", () => {
  const { container } = render(<FootPreview topCard={card} count={11} />);
  const foot = screen.getByRole("group", { name: "Your foot, 11 cards" });
  const rank = container.querySelector(".foot-rank")!;
  expect(rank.textContent).toBe("10");
  expect(rank.classList.contains("red")).toBe(true);
  expect(rank.querySelector("svg")).toBeNull();
  expect(screen.queryByRole("tooltip")).toBeNull();

  fireEvent.mouseEnter(foot);
  const tooltip = screen.getByRole("tooltip");
  expect(tooltip.textContent).toContain("10 of diamonds");
  expect(tooltip.querySelector(".card-art")).toBeTruthy();
  expect(foot.getAttribute("aria-describedby")).toBe(tooltip.id);
  expect(foot.dataset.previewOpen).toBe("true");

  fireEvent.mouseLeave(foot);
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(foot.dataset.previewOpen).toBe("false");
  // Retain the card in the DOM so its exit animation can finish.
  expect(container.querySelector(".foot-preview .card-art")).toBeTruthy();
});

it("supports keyboard focus and keeps the preview open while still focused", () => {
  render(<FootPreview topCard={{ ...card, suit: "spades" }} count={11} />);
  const foot = screen.getByRole("group", { name: "Your foot, 11 cards" });
  expect(foot.tabIndex).toBe(0);
  fireEvent.focus(foot);
  expect(screen.getByRole("tooltip").textContent).toContain("10 of spades");
  fireEvent.mouseEnter(foot);
  fireEvent.mouseLeave(foot);
  expect(screen.getByRole("tooltip")).toBeTruthy();
  fireEvent.blur(foot);
  expect(screen.queryByRole("tooltip")).toBeNull();
});

it("does not offer a preview before a foot has been chosen", () => {
  render(<FootPreview topCard={null} count={11} />);
  const foot = screen.getByRole("group", { name: "Your foot, 11 cards" });
  expect(foot.tabIndex).toBe(-1);
  fireEvent.mouseEnter(foot);
  expect(screen.queryByRole("tooltip")).toBeNull();
});
