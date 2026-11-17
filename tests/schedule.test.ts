import { describe, expect, it } from "vitest";
import { nextSlots } from "../src/lib/schedule";

describe("nextSlots", () => {
  it("devolve só dias configurados, em ordem e no futuro", () => {
    const from = new Date(2026, 10, 17, 10, 0); // terça
    const s = nextSlots([1, 3, 5], "09:00", 3, from);
    expect(s.map((d) => d.getDay())).toEqual([3, 5, 1]);
    expect(s.every((d) => d > from)).toBe(true);
  });
  it("sem dias, não devolve nada", () => {
    expect(nextSlots([], "09:00", 3)).toEqual([]);
  });
});
