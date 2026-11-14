import { expect, test } from "@playwright/test";
import { addEvent, demoEvent, isKairosEvent, levelForRisk } from "../../src/lib/liveEvents";

test("addEvent prepends newest first, dedupes by id, and caps the list", () => {
  const a = demoEvent(0);
  const b = demoEvent(1);
  let list = addEvent([], a);
  list = addEvent(list, b);
  expect(list.map((e) => e.id)).toEqual(["demo-1", "demo-0"]);
  expect(addEvent(list, b)).toBe(list); // duplicate: unchanged
  let long = list;
  for (let i = 2; i < 150; i++) long = addEvent(long, demoEvent(i));
  expect(long.length).toBe(100);
  expect(long[0].id).toBe("demo-149");
});

test("levelForRisk matches the published bands", () => {
  expect(levelForRisk(0)).toBe("low");
  expect(levelForRisk(29)).toBe("low");
  expect(levelForRisk(30)).toBe("medium");
  expect(levelForRisk(59)).toBe("medium");
  expect(levelForRisk(60)).toBe("high");
  expect(levelForRisk(84)).toBe("high");
  expect(levelForRisk(85)).toBe("critical");
  expect(levelForRisk(100)).toBe("critical");
});

test("every demo event is a valid KairosEvent whose level matches its risk", () => {
  for (let n = 0; n < 12; n++) {
    const e = demoEvent(n);
    expect(isKairosEvent(e)).toBe(true);
    expect(e.level).toBe(levelForRisk(e.risk));
    expect(["scripted", "audience"]).toContain(e.source);
  }
});

test("demo events are deterministic and audience ones only hit guest accounts", () => {
  expect(demoEvent(7, new Date(0))).toEqual(demoEvent(7, new Date(0)));
  for (let n = 0; n < 12; n++) {
    const e = demoEvent(n);
    if (e.source === "audience" && e.sensor === "login_guard") expect(e.target).toMatch(/^guest\d{2}$/);
  }
});

test("isKairosEvent rejects junk rows", () => {
  expect(isKairosEvent(null)).toBe(false);
  expect(isKairosEvent({})).toBe(false);
  expect(isKairosEvent({ id: "x", created_at: "t" })).toBe(false);
});
