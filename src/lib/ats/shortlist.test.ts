import { describe, expect, it } from "vitest";
import { SHORTLIST_THRESHOLD, shortlistDecision } from "./weights";

describe("ATS shortlisting threshold", () => {
  it("uses an inclusive 85 threshold", () => {
    expect(SHORTLIST_THRESHOLD).toBe(85);
  });

  it.each([
    [84, "filtered_out"],
    [84.99, "filtered_out"],
    [85, "shortlisted"],
    [85.01, "shortlisted"],
    [86, "shortlisted"],
    [90, "shortlisted"],
    [95, "shortlisted"],
    [100, "shortlisted"],
    [0, "filtered_out"],
  ])("score %s => %s", (score, expected) => {
    expect(shortlistDecision(score as number)).toBe(expected);
  });

  it("makes no decision without a score", () => {
    expect(shortlistDecision(null)).toBeNull();
    expect(shortlistDecision(undefined)).toBeNull();
    expect(shortlistDecision(Number.NaN)).toBeNull();
  });
});
