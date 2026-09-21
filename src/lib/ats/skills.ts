/**
 * Skill normalization, alias resolution, negative-matching guardrails,
 * and contextual evidence extraction.
 */

// Canonical alias families where all terms strictly refer to the same technology
const ALIAS_GROUPS: string[][] = [
  ["javascript", "js", "ecmascript", "es6", "es2015", "es2020"],
  ["typescript", "ts"],
  ["react", "react.js", "reactjs"],
  ["node", "node.js", "nodejs"],
  ["next", "next.js", "nextjs"],
  ["vue", "vue.js", "vuejs"],
  ["angular", "angular.js", "angularjs"],
  ["postgres", "postgresql", "psql"],
  ["mongodb", "mongo"],
  ["kubernetes", "k8s"],
  ["docker", "containerization", "containerisation", "containers"],
  ["aws", "amazon web services"],
  ["gcp", "google cloud", "google cloud platform"],
  ["azure", "microsoft azure"],
  ["python", "python3"],
  ["golang", "go lang", "go"],
  ["c#", "csharp", "c sharp", ".net", "dotnet"],
  ["c++", "cpp"],
  ["ci/cd", "cicd", "continuous integration", "continuous delivery"],
  ["rest", "rest api", "restful", "restful api", "restful apis", "rest apis"],
  ["graphql", "gql"],
  ["tailwind", "tailwindcss", "tailwind css"],
  ["html", "html5"],
  ["css", "css3"],
  ["linux", "unix"],
  ["git", "github", "gitlab"],
  ["sql", "structured query language"],
];

// Negative match guardrails: skills that must NEVER match each other
const FORBIDDEN_CROSS_MATCHES: Record<string, string[]> = {
  react: ["angular", "angularjs", "vue", "vuejs", "svelte"],
  angular: ["react", "reactjs", "vue", "vuejs", "svelte"],
  vue: ["react", "reactjs", "angular", "angularjs", "svelte"],
  python: ["java", "javascript", "ruby", "c++", "php"],
  java: ["javascript", "js", "python", "c#", "ruby"],
  javascript: ["java", "python", "c#", "ruby", "php"],
  aws: ["azure", "microsoft azure", "gcp", "google cloud"],
  azure: ["aws", "amazon web services", "gcp", "google cloud"],
  gcp: ["aws", "amazon web services", "azure", "microsoft azure"],
  mongodb: ["postgresql", "postgres", "mysql", "oracle", "sql server"],
  postgresql: ["mongodb", "couchdb", "cassandra"],
  docker: ["kubernetes", "k8s"],
  kubernetes: ["docker"],
};

/** Lower-cases, trims and strips punctuation noise. */
export function normalizeSkill(value: string): string {
  return value
    .toLowerCase()
    .replace(/[（）()[\]{}]/g, " ")
    .replace(/[_/\\|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/, "");
}

/** All accepted spellings for a skill, including its approved alias family. */
export function skillVariants(skill: string): string[] {
  const base = normalizeSkill(skill);
  if (!base) return [];

  const stripped = base.replace(/\.?js$/, "").trim();
  const variants = new Set<string>([base]);
  if (stripped && stripped.length > 1) variants.add(stripped);

  for (const group of ALIAS_GROUPS) {
    if (group.includes(base) || (stripped && group.includes(stripped))) {
      for (const alias of group) variants.add(alias);
    }
  }
  return [...variants];
}

/** Strict word-boundary matching with regex escaping. */
export function wordBoundaryHit(haystack: string, needle: string): boolean {
  if (!needle || !haystack) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Boundary check supports symbols like C++, C#, .NET
  const pattern = new RegExp(`(^|[^a-z0-9+#.])${escaped}([^a-z0-9+#.]|$)`, "i");
  return pattern.test(haystack);
}

/** Checks if a candidate needle violates negative-match guardrails for a target skill. */
export function isForbiddenCrossMatch(targetSkill: string, foundTerm: string): boolean {
  const normTarget = normalizeSkill(targetSkill);
  const normFound = normalizeSkill(foundTerm);
  if (normTarget === normFound) return false;

  const forbidden = FORBIDDEN_CROSS_MATCHES[normTarget];
  if (forbidden && forbidden.includes(normFound)) {
    return true;
  }
  return false;
}

export type SkillEvidence = {
  skill: string;
  matched: boolean;
  evidence: string | null;
  confidence: "experience_supported" | "listed_only" | "none";
  matchedVariant?: string;
};

const EXPERIENCE_KEYWORDS = [
  "built",
  "developed",
  "architected",
  "led",
  "engineered",
  "implemented",
  "designed",
  "managed",
  "deployed",
  "maintained",
  "created",
  "migrated",
  "optimized",
  "collaborated",
  "responsible for",
  "experience with",
  "utilized",
  "leveraged",
];

/** Extracts the cleanest single-sentence context containing the needle. */
function extractEvidenceSentence(text: string, needle: string): string | null {
  const lines = text.split(/[\r\n]+|\.\s+/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 15 && wordBoundaryHit(trimmed, needle)) {
      // Clean up whitespace
      return trimmed.replace(/\s+/g, " ").slice(0, 200);
    }
  }
  return null;
}

/** Evaluates whether a skill is present in the resume and locates its evidence. */
export function evaluateSkillEvidence(
  skill: string,
  resumeText: string,
  parsedSkills: string[] = [],
  experienceSectionText: string = "",
): SkillEvidence {
  const variants = skillVariants(skill);

  // Check experience section first for high-confidence evidence
  for (const variant of variants) {
    if (isForbiddenCrossMatch(skill, variant)) continue;

    if (experienceSectionText && wordBoundaryHit(experienceSectionText, variant)) {
      const sentence = extractEvidenceSentence(experienceSectionText, variant);
      return {
        skill,
        matched: true,
        evidence: sentence || `Demonstrated in work experience: ${variant}`,
        confidence: "experience_supported",
        matchedVariant: variant,
      };
    }
  }

  // Check whole resume text
  for (const variant of variants) {
    if (isForbiddenCrossMatch(skill, variant)) continue;

    if (wordBoundaryHit(resumeText, variant)) {
      const sentence = extractEvidenceSentence(resumeText, variant);
      const isExpSupported = sentence
        ? EXPERIENCE_KEYWORDS.some((kw) => sentence.toLowerCase().includes(kw))
        : false;

      return {
        skill,
        matched: true,
        evidence: sentence || `Referenced in resume: ${variant}`,
        confidence: isExpSupported ? "experience_supported" : "listed_only",
        matchedVariant: variant,
      };
    }
  }

  // Check parsed explicit skill list
  const normParsed = parsedSkills.map(normalizeSkill);
  for (const variant of variants) {
    if (isForbiddenCrossMatch(skill, variant)) continue;

    if (normParsed.includes(variant)) {
      return {
        skill,
        matched: true,
        evidence: `Listed in skills section: ${variant}`,
        confidence: "listed_only",
        matchedVariant: variant,
      };
    }
  }

  return {
    skill,
    matched: false,
    evidence: null,
    confidence: "none",
  };
}

export type SkillMatch = {
  matched: string[];
  missing: string[];
  evidenceMap: Record<string, SkillEvidence>;
};

/** Splits a job's skill list into matched and missing with complete evidence. */
export function matchSkillList(
  skills: string[],
  resumeText: string,
  resumeSkills: string[] = [],
  aiMatched: string[] = [],
  experienceSectionText: string = "",
): SkillMatch {
  const matched: string[] = [];
  const missing: string[] = [];
  const evidenceMap: Record<string, SkillEvidence> = {};

  const aiSet = new Set(aiMatched.map(normalizeSkill));

  for (const skill of skills) {
    const result = evaluateSkillEvidence(skill, resumeText, resumeSkills, experienceSectionText);

    // If deterministic evaluation matched, accept it
    if (result.matched) {
      matched.push(skill);
      evidenceMap[skill] = result;
      continue;
    }

    // Check if AI suggested a match, but strictly verify that evidence exists in the resume
    const hasAiSuggestion = skillVariants(skill).some((v) => aiSet.has(v));
    if (hasAiSuggestion) {
      // Find supporting sentence in resume text
      const sentence = extractEvidenceSentence(resumeText, skill);
      if (sentence) {
        matched.push(skill);
        evidenceMap[skill] = {
          skill,
          matched: true,
          evidence: sentence,
          confidence: "experience_supported",
        };
        continue;
      }
    }

    missing.push(skill);
    evidenceMap[skill] = result;
  }

  return { matched, missing, evidenceMap };
}

/** Legacy signature compatibility helper */
export function skillMatches(skill: string, resumeText: string, resumeSkills: string[]): boolean {
  return evaluateSkillEvidence(skill, resumeText, resumeSkills).matched;
}
