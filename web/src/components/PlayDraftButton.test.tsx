import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PlayDraftButton } from "./PlayDraftButton";

it.each([50, 90, 120])(
  "blocks a draft below %s and enables it exactly at the minimum",
  (minimum) => {
    const onPlay = vi.fn();
    const view = render(
      <PlayDraftButton
        count={1}
        total={minimum - 5}
        minimum={minimum}
        onPlay={onPlay}
      />,
    );
    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.textContent).toBe("Play draft");
    const control = screen.getByRole("group", { name: "Play draft" });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    fireEvent.click(control);
    expect(onPlay).not.toHaveBeenCalled();
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseEnter(control);
    expect(screen.getByRole("tooltip").textContent).toBe(
      `Meld must be greater than or equal to ${minimum} points`,
    );
    fireEvent.keyDown(control, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseLeave(control);
    fireEvent.mouseEnter(control);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    view.rerender(
      <PlayDraftButton
        count={2}
        total={minimum}
        minimum={minimum}
        onPlay={onPlay}
      />,
    );
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe("Play draft");
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(button);
    expect(onPlay).toHaveBeenCalledOnce();
  },
);

it("only shows the requirement while hovering a disabled draft with staged cards", () => {
  const onPlay = vi.fn();
  const view = render(
    <PlayDraftButton count={0} total={0} minimum={50} onPlay={onPlay} />,
  );
  const control = screen.getByRole("group", { name: "Play draft" });
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.mouseEnter(control);
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.mouseLeave(control);
  view.rerender(
    <PlayDraftButton count={1} total={30} minimum={50} onPlay={onPlay} />,
  );
  fireEvent.focus(control);
  fireEvent.click(control);
  fireEvent.keyDown(control, { key: "Enter" });
  fireEvent.keyDown(control, { key: " " });
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.mouseEnter(control);
  expect(screen.getByRole("tooltip")).toBeTruthy();
  fireEvent.mouseLeave(control);
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.mouseEnter(control);
  view.rerender(
    <PlayDraftButton count={0} total={0} minimum={50} onPlay={onPlay} />,
  );
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(onPlay).not.toHaveBeenCalled();
});

it("allows smaller subsequent melds but never submits an empty draft", () => {
  const onPlay = vi.fn();
  const view = render(
    <PlayDraftButton count={1} total={15} minimum={null} onPlay={onPlay} />,
  );
  expect(screen.getByRole("button").textContent).toBe("Play draft");
  fireEvent.click(screen.getByRole("button"));
  expect(onPlay).toHaveBeenCalledOnce();
  expect(screen.queryByRole("tooltip", { hidden: true })).toBeNull();
  view.rerender(
    <PlayDraftButton count={0} total={0} minimum={null} onPlay={onPlay} />,
  );
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("button").textContent).toBe("Play draft");
  fireEvent.click(screen.getByRole("button"));
  expect(onPlay).toHaveBeenCalledOnce();
});

it("explains a blocked going-out draft on hover", () => {
  const onPlay = vi.fn();
  const message =
    "You need a clean book and a dirty book to go out. Keep one card after discarding.";
  const view = render(
    <PlayDraftButton
      count={1}
      total={30}
      minimum={null}
      blockedReason={message}
      onPlay={onPlay}
    />,
  );
  const control = screen.getByRole("group", { name: "Play draft" });
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.focus(control);
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.mouseEnter(control);
  expect(screen.getByRole("tooltip").textContent).toBe(message);
  fireEvent.keyDown(control, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.click(screen.getByRole("button"));
  expect(onPlay).not.toHaveBeenCalled();
  view.rerender(
    <PlayDraftButton count={1} total={30} minimum={null} onPlay={onPlay} />,
  );
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
    false,
  );
  expect(screen.queryByRole("tooltip", { hidden: true })).toBeNull();
});
