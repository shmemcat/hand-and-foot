import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function useGameMenuPopover() {
  const menu = useRef<HTMLDetailsElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const close = (restoreFocus = false) => {
    if (!menu.current) return;
    menu.current.open = false;
    setOpen(false);
    if (restoreFocus) menu.current.querySelector("summary")?.focus();
  };

  useLayoutEffect(() => {
    const details = menu.current;
    const content = panel.current;
    if (!details || !content) return;
    const frame = details.closest<HTMLElement>(".site-frame");
    const main = details.closest("main");
    const updateHeight = () => {
      if (!details.open || !frame) return;
      const frameStyle = getComputedStyle(frame);
      let bottom =
        frame.getBoundingClientRect().bottom -
        parseFloat(frameStyle.borderBottomWidth || "0") -
        Math.max(16, parseFloat(frameStyle.paddingBottom || "0"));
      // On phones, the table scrolls above the fixed hand drawer.
      if (main) {
        const mainStyle = getComputedStyle(main);
        if (/auto|scroll|hidden|clip/.test(mainStyle.overflowY)) {
          bottom = Math.min(
            bottom,
            main.getBoundingClientRect().top +
              main.clientTop +
              main.clientHeight -
              Math.max(16, parseFloat(mainStyle.paddingBottom || "0")),
          );
        }
      }
      content.style.maxHeight = `${Math.max(0, bottom - content.getBoundingClientRect().top)}px`;
    };
    const onToggle = () => {
      setOpen(details.open);
      if (details.open) {
        details
          .closest(".game-menu-controls")
          ?.querySelectorAll<HTMLDetailsElement>("details[open]")
          .forEach((other) => {
            if (other !== details) other.open = false;
          });
      }
      updateHeight();
    };
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateHeight);
    if (frame) observer?.observe(frame);
    if (main) observer?.observe(main);
    details.addEventListener("toggle", onToggle);
    window.addEventListener("resize", updateHeight);
    document.addEventListener("scroll", updateHeight, true);
    return () => {
      observer?.disconnect();
      details.removeEventListener("toggle", onToggle);
      window.removeEventListener("resize", updateHeight);
      document.removeEventListener("scroll", updateHeight, true);
    };
  }, []);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.open) close(true);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  return { menu, panel, close, open };
}
