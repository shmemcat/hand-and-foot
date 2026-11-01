import { expect, it } from "vitest";
import { isPileScrollClamp, markPileScrollClamp } from "./cardAnimations";

it("identifies an automatic clamp for every listener without ignoring the next user scroll", async () => {
  const strip = document.createElement("div");
  strip.scrollLeft = 60;
  markPileScrollClamp(strip);
  const clamp = new Event("scroll");
  strip.dispatchEvent(clamp);
  expect(isPileScrollClamp(clamp)).toBe(true);
  await Promise.resolve();
  expect(isPileScrollClamp(clamp)).toBe(true);
  const manual = new Event("scroll");
  strip.dispatchEvent(manual);
  expect(isPileScrollClamp(manual)).toBe(false);
});
