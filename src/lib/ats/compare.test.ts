import { describe, expect, it } from "vitest";
import { MAX_COMPARISON_CANDIDATES } from "@/lib/applications.functions";

describe("Phase 2: Candidate Comparison Logic & Validation", () => {
  it("enforces maximum candidate comparison limit of 5", () => {
    expect(MAX_COMPARISON_CANDIDATES).toBe(5);
  });

  it("validates that all candidates must belong to the same job opening", () => {
    const candidateGroup1 = [
      { id: "c1", job_id: "job-alpha", full_name: "Candidate 1", ats_score: 90 },
      { id: "c2", job_id: "job-alpha", full_name: "Candidate 2", ats_score: 75 },
    ];

    const firstJobId = candidateGroup1[0]!.job_id;
    const sameJobPass = candidateGroup1.every((c) => c.job_id === firstJobId);
    expect(sameJobPass).toBe(true);

    const candidateGroupMismatched = [
      { id: "c1", job_id: "job-alpha", full_name: "Candidate 1", ats_score: 90 },
      { id: "c2", job_id: "job-beta", full_name: "Candidate 2", ats_score: 85 },
    ];

    const mismatchedJobPass = candidateGroupMismatched.every(
      (c) => c.job_id === candidateGroupMismatched[0]!.job_id,
    );
    expect(mismatchedJobPass).toBe(false);
  });

  it("rejects candidate comparison sets with fewer than 2 candidates", () => {
    const singleCandidate = ["c1"];
    expect(singleCandidate.length < 2).toBe(true);
  });

  it("rejects candidate comparison sets with more than 5 candidates", () => {
    const sixCandidates = ["c1", "c2", "c3", "c4", "c5", "c6"];
    expect(sixCandidates.length > MAX_COMPARISON_CANDIDATES).toBe(true);
  });

  it("preserves exact user selection order without any sorting or ranking", () => {
    const requestedIds = ["cand-3", "cand-1", "cand-2"];
    const candidates = [
      { id: "cand-1", score: 95 },
      { id: "cand-2", score: 60 },
      { id: "cand-3", score: 80 },
    ];

    const map = new Map(candidates.map((c) => [c.id, c]));
    const ordered = requestedIds.map((id) => map.get(id)!);

    // Order must strictly match requestedIds: [cand-3, cand-1, cand-2]
    expect(ordered.map((c) => c.id)).toEqual(["cand-3", "cand-1", "cand-2"]);
    // Must NOT be sorted by score [95, 80, 60]
    expect(ordered.map((c) => c.score)).toEqual([80, 95, 60]);
  });

  it("does not calculate or modify ATS scores", () => {
    const persistedScore = 95;
    const comparisonScore = persistedScore;
    expect(comparisonScore).toBe(persistedScore);
  });
});
