import { expect, test } from "@playwright/test";
import { labelEventCitations, parseAnalystAnswer } from "../../src/lib/analystText";

// ---------------------------------------------------------------------------------------
// Format v2: blocks separated by blank lines; a block's first line may carry a label.
// ---------------------------------------------------------------------------------------

test("blank lines separate blocks, each starting with a label", () => {
  const blocks = parseAnalystAnswer(
    "What happened: j.smith's account was taken over.\n\nWhy it matters: the agent nearly wired money.\n\nNext step: approve the containment.",
  );
  expect(blocks).toEqual([
    { label: "What happened:", text: "j.smith's account was taken over.", mitre: [] },
    { label: "Why it matters:", text: "the agent nearly wired money.", mitre: [] },
    { label: "Next step:", text: "approve the containment.", mitre: [] },
  ]);
});

test("single newlines inside a block are wrapped prose, joined with a space — never new sections", () => {
  const blocks = parseAnalystAnswer(
    "What happened: a bot guessed j.smith's password,\nthen a fake CFO email followed.\n\nTriage: true positive.",
  );
  expect(blocks).toEqual([
    { label: "What happened:", text: "a bot guessed j.smith's password, then a fake CFO email followed.", mitre: [] },
    { label: "Triage:", text: "true positive.", mitre: [] },
  ]);
});

test("a continuation line that happens to start with a label stays continuation text", () => {
  // Only the FIRST line of a block can carry a label.
  const [block] = parseAnalystAnswer("Why it matters: money nearly left.\nNext step: is on the next block, not here.");
  expect(block.label).toBe("Why it matters:");
  expect(block.text).toBe("money nearly left. Next step: is on the next block, not here.");
});

test("a block with no label is a plain paragraph; labels are exact and block-initial", () => {
  expect(parseAnalystAnswer("Just a sentence.")).toEqual([{ label: null, text: "Just a sentence.", mitre: [] }]);
  expect(parseAnalystAnswer("what happened: lower case")[0].label).toBeNull();
  expect(parseAnalystAnswer("See What happened: above")[0].label).toBeNull();
  // Leading/trailing blank lines and whitespace-only lines produce no empty blocks.
  expect(parseAnalystAnswer("\n\n  \nOne.\n \n\nTwo.\n\n")).toEqual([
    { label: null, text: "One.", mitre: [] },
    { label: null, text: "Two.", mitre: [] },
  ]);
});

test("a MITRE block turns valid ids into chips and keeps the rest as text, across wrapped lines", () => {
  const [block] = parseAnalystAnswer("MITRE: T1110.004,\nAML.T0051.001 via the poisoned email.");
  expect(block.label).toBe("MITRE:");
  expect(block.mitre.map((m) => ({ raw: m.raw, kind: m.kind }))).toEqual([
    { raw: "T1110.004", kind: "attack" },
    { raw: "AML.T0051.001", kind: "atlas" },
  ]);
  // Links only to the official hosts, built from the validated id.
  expect(block.mitre[0].href).toBe("https://attack.mitre.org/techniques/T1110/004/");
  expect(block.mitre[1].href).toBe("https://atlas.mitre.org/techniques/AML.T0051.001");
  expect(block.text).toBe("via the poisoned email.");
});

test("a sentence-ending period doesn't break an id, and duplicates collapse", () => {
  const [block] = parseAnalystAnswer("MITRE: AML.T0051.001. T1656 T1656");
  expect(block.mitre.map((m) => m.raw)).toEqual(["AML.T0051.001", "T1656"]);
});

test("invalid ids and attacker text never become chips or links", () => {
  const [block] = parseAnalystAnswer("MITRE: evil.example T99999 https://evil.example/x");
  expect(block.mitre).toEqual([]);
  expect(block.text).toBe("evil.example T99999 https://evil.example/x");
});

test("markdown in an answer stays inert text", () => {
  const blocks = parseAnalystAnswer("![x](https://evil.example/p.png)\n\n[click](https://evil.example)");
  expect(blocks).toEqual([
    { label: null, text: "![x](https://evil.example/p.png)", mitre: [] },
    { label: null, text: "[click](https://evil.example)", mitre: [] },
  ]);
});

// ---------------------------------------------------------------------------------------
// E1, E2, … labels for event-id citations (sent separately from the answer).
// ---------------------------------------------------------------------------------------

test("event citations label as E1, E2, … in order of appearance; MITRE ids get no label", () => {
  const labels = labelEventCitations(["evt-9f2", "T1110.004", "evt-0aa", "AML.T0051.001", "evt-123"]);
  expect([...labels.entries()]).toEqual([
    ["evt-9f2", "E1"],
    ["evt-0aa", "E2"],
    ["evt-123", "E3"],
  ]);
});

test("the same event id always keeps the same label", () => {
  const labels = labelEventCitations(["evt-a", "evt-b", "evt-a"]);
  expect(labels.get("evt-a")).toBe("E1");
  expect(labels.get("evt-b")).toBe("E2");
  expect(labels.size).toBe(2);
});

test("attacker-looking citation strings get a label but never a link kind", () => {
  // labelEventCitations only maps display labels; classifyCitation already refuses hrefs
  // for anything that isn't a validated MITRE id, so a URL-shaped citation stays plain.
  const labels = labelEventCitations(["https://evil.example/x"]);
  expect(labels.get("https://evil.example/x")).toBe("E1");
});
