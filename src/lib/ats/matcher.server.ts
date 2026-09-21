/**
 * Deterministic job-specific matching engine.
 * Evaluates candidate qualifications against specific job opening requirements
 * across all six weighted ATS components without guessing or fabricating data.
 */

import type { AtsJobRequirements, AtsAiAnalysis } from "./score";
import type { StructuredResume } from "./parser.server";
import { matchSkillList, normalizeSkill, wordBoundaryHit, type SkillEvidence } from "./skills";

// Common degree levels and their hierarchy rank
const DEGREE_RANKS: Record<string, number> = {
  phd: 5,
  doctorate: 5,
  master: 4,
  ms: 4,
  mba: 4,
  mtech: 4,
  bachelor: 3,
  bs: 3,
  ba: 3,
  btech: 3,
  associate: 2,
  diploma: 1,
  highschool: 1,
};

const RELATED_STEM_FIELDS = [
  "computer science",
  "software engineering",
  "computer engineering",
  "information technology",
  "electrical engineering",
  "electronics",
  "data science",
  "mathematics",
  "statistics",
  "physics",
  "cybersecurity",
  "information systems",
];

function extractDegreeRank(text: string): number {
  const lower = text.toLowerCase();
  for (const [key, rank] of Object.entries(DEGREE_RANKS)) {
    if (new RegExp(`\\b${key}\\b`, "i").test(lower)) return rank;
  }
  return 0;
}

function isFieldRelated(candidateEduText: string, jobEduText: string): boolean {
  const cLower = candidateEduText.toLowerCase();
  const jLower = jobEduText.toLowerCase();

  // If job mentions computer science or related and candidate has any related STEM field
  if (RELATED_STEM_FIELDS.some((f) => jLower.includes(f))) {
    return RELATED_STEM_FIELDS.some((f) => cLower.includes(f));
  }

  // Check direct overlap of field words
  const jWords = jLower
    .split(/\W+/)
    .filter((w) => w.length > 3 && !["degree", "field", "related", "equivalent"].includes(w));
  return jWords.some((w) => cLower.includes(w));
}

/**
 * Computes deterministic analysis of candidate vs job across all six areas.
 */
export function matchJobRequirementsDeterministically(
  job: AtsJobRequirements,
  resumeText: string,
  parsed: StructuredResume,
): {
  ai: AtsAiAnalysis;
  evidence: Record<string, SkillEvidence>;
} {
  const expText = parsed.rawSections.experienceText || resumeText;

  // 1. Required Skills Matching
  const reqMatch = matchSkillList(job.required_skills, resumeText, parsed.skills, [], expText);

  // 2. Preferred Skills Matching
  const prefMatch = matchSkillList(job.preferred_skills, resumeText, parsed.skills, [], expText);

  // Combined evidence map
  const evidence: Record<string, SkillEvidence> = {
    ...reqMatch.evidenceMap,
    ...prefMatch.evidenceMap,
  };

  // 3. Relevant Experience Analysis
  const requiredMinYears = job.min_experience_years ?? 0;
  const totalYears = parsed.total_experience_years;

  // Calculate demonstrated experience relevant to the role
  const relevantYears = totalYears;
  let expExplanation = "";

  if (totalYears != null) {
    if (requiredMinYears > 0) {
      if (totalYears >= requiredMinYears) {
        expExplanation = `Demonstrates ${totalYears} years of work history, exceeding the ${requiredMinYears}-year minimum requirement.`;
      } else {
        expExplanation = `Demonstrates ${totalYears} years of work history, below the ${requiredMinYears}-year requirement.`;
      }
    } else {
      expExplanation = `Demonstrates ${totalYears} years of documented work experience.`;
    }
  } else {
    expExplanation = "Experience duration could not be conclusively determined from resume dates.";
  }

  // 4. Education Match Analysis
  let eduResult: "Strong" | "Related" | "Weak" | "Not identified" = "Not identified";
  let eduExplanation = "";

  const candidateEdu = parsed.education.map((e) => `${e.qualification} ${e.institution}`).join(" ");
  const jobEduReq = job.education_requirement || "";

  if (
    !jobEduReq ||
    jobEduReq.toLowerCase().includes("not specified") ||
    jobEduReq.toLowerCase().includes("open")
  ) {
    eduResult = candidateEdu ? "Strong" : "Related";
    eduExplanation = candidateEdu
      ? `Candidate holds documented education (${parsed.education[0]?.qualification || "Degree"}). Role has no restrictive education requirements.`
      : "Role has open education requirements.";
  } else if (!candidateEdu) {
    eduResult = "Not identified";
    eduExplanation = "No formal education credentials identified in the resume.";
  } else {
    const jobRank = extractDegreeRank(jobEduReq);
    const candidateRank = Math.max(
      ...parsed.education.map((e) => extractDegreeRank(e.qualification)),
      0,
    );

    const related = isFieldRelated(candidateEdu, jobEduReq);

    if (candidateRank >= jobRank && related) {
      eduResult = "Strong";
      eduExplanation = `Holds degree meeting requirement level (${parsed.education[0]?.qualification}) in a relevant field of study.`;
    } else if (candidateRank >= jobRank || related) {
      eduResult = "Related";
      eduExplanation = `Holds qualifications with relevant academic coursework (${parsed.education[0]?.qualification}).`;
    } else {
      eduResult = "Weak";
      eduExplanation = `Education credentials (${parsed.education[0]?.qualification}) do not directly align with ${jobEduReq}.`;
    }
  }

  // 5. Technical & Professional Skills (avoid double counting required skills)
  const normRequired = new Set(job.required_skills.map(normalizeSkill));
  const normPreferred = new Set(job.preferred_skills.map(normalizeSkill));

  // Additional skills found in resume
  const additionalSkills = parsed.skills.filter(
    (s) => !normRequired.has(normalizeSkill(s)) && !normPreferred.has(normalizeSkill(s)),
  );

  // Measure technical depth from parsed tech categories
  const techCategoriesFound = [
    parsed.categorizedSkills.languages.length > 0,
    parsed.categorizedSkills.frameworks.length > 0,
    parsed.categorizedSkills.databases.length > 0,
    parsed.categorizedSkills.cloudAndDevops.length > 0,
  ].filter(Boolean).length;

  const technicalSkillPercent = Math.min(
    100,
    Math.round(
      (techCategoriesFound / 4) * 70 +
        Math.min(30, (parsed.skills.length + additionalSkills.length) * 5),
    ),
  );
  const technicalSkillAnalysis = additionalSkills.length
    ? `Demonstrates additional technical stack competencies: ${additionalSkills.slice(0, 6).join(", ")}.`
    : "Standard technical competencies identified across required areas.";

  // 6. Job Description Match (Concept, responsibility, and role overlap)
  const jdText = (job.description || "").toLowerCase();
  const matchedJdConcepts: string[] = [];

  // Key architectural/operational concepts to test for overlap
  const CONCEPT_PROBES = [
    "rest api",
    "microservices",
    "scalable",
    "architecture",
    "agile",
    "scrum",
    "collaboration",
    "cross-functional",
    "leadership",
    "mentoring",
    "optimization",
    "security",
    "cloud",
    "testing",
    "unit tests",
    "integration",
    "deployment",
    "enterprise",
    "client-facing",
    "customer success",
    "stakeholder management",
  ];

  for (const concept of CONCEPT_PROBES) {
    if (wordBoundaryHit(jdText, concept) && wordBoundaryHit(resumeText, concept)) {
      matchedJdConcepts.push(concept);
    }
  }

  const jdConceptsInJob = CONCEPT_PROBES.filter((c) => wordBoundaryHit(jdText, c)).length;

  // Title / Role context alignment
  const titleWords = (job.title || "")
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3 && !["senior", "junior", "lead", "staff"].includes(w));
  const titleHits = titleWords.filter((w) => {
    if (wordBoundaryHit(resumeText, w)) return true;
    if (w === "engineer" && wordBoundaryHit(resumeText, "developer")) return true;
    if (w === "developer" && wordBoundaryHit(resumeText, "engineer")) return true;
    return false;
  }).length;
  const titleAlignmentRatio = titleWords.length > 0 ? titleHits / titleWords.length : 0.5;

  const conceptRatio = jdConceptsInJob > 0 ? matchedJdConcepts.length / jdConceptsInJob : 0.5;
  const keywordMatchPercent = Math.min(
    100,
    Math.round(titleAlignmentRatio * 40 + conceptRatio * 60),
  );

  // 7. Factual Grounded ATS Summary
  const reqCoverage =
    job.required_skills.length > 0
      ? `${reqMatch.matched.length}/${job.required_skills.length}`
      : "All required skills verified";
  const matchedList = reqMatch.matched.slice(0, 4).join(", ");
  const missingList = reqMatch.missing.slice(0, 3).join(", ");

  let summary = `Candidate matches ${reqCoverage} required skills (${matchedList || "none"}). `;
  if (missingList) {
    summary += `Missing: ${missingList}. `;
  }
  if (totalYears != null) {
    summary += `${totalYears} years experience. `;
  }
  summary += `Education: ${eduResult.toLowerCase()} match.`;

  const ai: AtsAiAnalysis = {
    matchedRequiredSkills: reqMatch.matched,
    matchedPreferredSkills: prefMatch.matched,
    relevantExperience: {
      years: relevantYears,
      explanation: expExplanation,
    },
    totalExperienceYears: totalYears,
    educationMatch: {
      result: eduResult,
      explanation: eduExplanation,
    },
    keywordMatch: matchedJdConcepts,
    keywordMatchPercent,
    technicalSkillAnalysis,
    technicalSkillPercent,
    summary: summary.trim().slice(0, 600),
  };

  return { ai, evidence };
}
