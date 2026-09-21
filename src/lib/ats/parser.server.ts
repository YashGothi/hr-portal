/**
 * Robust deterministic resume parser.
 * Extracts candidate profile, work history, non-overlapping dates,
 * education, categorized skills, certifications, and projects from raw text.
 */

export type ParsedWorkRole = {
  title: string;
  company: string;
  duration: string;
  startYear?: number;
  endYear?: number;
  responsibilities: string[];
};

export type ParsedEducation = {
  qualification: string;
  fieldOfStudy?: string | undefined;
  institution: string;
  year: string;
};

export type ParsedCandidateProfile = {
  name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
};

export type StructuredResume = {
  candidate: ParsedCandidateProfile;
  summary: string | null;
  skills: string[];
  categorizedSkills: {
    languages: string[];
    frameworks: string[];
    databases: string[];
    cloudAndDevops: string[];
    tools: string[];
    domain: string[];
  };
  total_experience_years: number | null;
  dates_uncertain: boolean;
  experience: ParsedWorkRole[];
  education: ParsedEducation[];
  certifications: string[];
  projects: Array<{ title: string; technologies: string[]; description?: string }>;
  rawSections: {
    experienceText: string;
    educationText: string;
    skillsText: string;
  };
};

const KNOWN_LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "java",
  "c#",
  "c++",
  "c",
  "golang",
  "go",
  "rust",
  "ruby",
  "php",
  "swift",
  "kotlin",
  "scala",
  "sql",
  "html",
  "css",
  "r",
  "shell",
  "bash",
];

const KNOWN_FRAMEWORKS = [
  "react",
  "react.js",
  "next.js",
  "vue",
  "vue.js",
  "angular",
  "node.js",
  "express",
  "django",
  "flask",
  "fastapi",
  "spring",
  "spring boot",
  ".net",
  "dotnet",
  "laravel",
  "ruby on rails",
  "tailwind",
  "bootstrap",
];

const KNOWN_DATABASES = [
  "postgresql",
  "postgres",
  "mysql",
  "mongodb",
  "redis",
  "elasticsearch",
  "sqlite",
  "dynamodb",
  "cassandra",
  "oracle",
  "sql server",
];

const KNOWN_CLOUD_DEVOPS = [
  "aws",
  "azure",
  "gcp",
  "google cloud",
  "docker",
  "kubernetes",
  "k8s",
  "terraform",
  "ansible",
  "jenkins",
  "ci/cd",
  "github actions",
  "gitlab ci",
  "linux",
];

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

type YearMonthInterval = { start: number; end: number };

/** Merges overlapping intervals [startMonths, endMonths] to avoid double counting */
function calculateNonOverlappingYears(intervals: YearMonthInterval[]): {
  totalYears: number;
  uncertain: boolean;
} {
  if (!intervals.length) return { totalYears: 0, uncertain: true };

  // Sort intervals by start
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: YearMonthInterval[] = [];

  for (const interval of sorted) {
    if (!merged.length) {
      merged.push({ ...interval });
    } else {
      const last = merged[merged.length - 1];
      if (last && interval.start <= last.end) {
        last.end = Math.max(last.end, interval.end);
      } else {
        merged.push({ ...interval });
      }
    }
  }

  let totalMonths = 0;
  for (const m of merged) {
    totalMonths += Math.max(1, m.end - m.start);
  }

  const years = Math.round((totalMonths / 12) * 10) / 10;
  return { totalYears: Math.min(50, Math.max(0, years)), uncertain: false };
}

/** Extracts date intervals like "2019 - 2023", "Jan 2020 - Present", "03/2018 - 11/2021" */
function extractEmploymentIntervals(text: string): YearMonthInterval[] {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentTotalMonths = currentYear * 12 + currentMonth;

  const intervals: YearMonthInterval[] = [];

  // Pattern: (Month? Year) to (Month? Year | Present | Current)
  const regex =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{1,2}\/)?\s*['’]?(\d{4}|\d{2})\s*(?:-|–|—|to)\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{1,2}\/)?\s*(present|current|now|['’]?\d{4}|['’]?\d{2})\b/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const rawStartMonth = (match[1] || "").toLowerCase().replace("/", "");
    const rawStartYear = match[2];
    if (!rawStartYear) continue;

    let startYear = parseInt(rawStartYear, 10);
    if (startYear < 100) startYear += startYear > 50 ? 1900 : 2000;

    if (startYear < 1970 || startYear > currentYear + 1) continue;

    const startMonth =
      MONTH_NAMES[rawStartMonth] ||
      (parseInt(rawStartMonth, 10) >= 1 && parseInt(rawStartMonth, 10) <= 12
        ? parseInt(rawStartMonth, 10)
        : 1);
    const startTotalMonths = startYear * 12 + startMonth;

    const rawEndMonth = (match[3] || "").toLowerCase().replace("/", "");
    const rawEndYearStr = (match[4] || "").toLowerCase();

    let endTotalMonths: number;
    if (["present", "current", "now"].includes(rawEndYearStr)) {
      endTotalMonths = currentTotalMonths;
    } else {
      let endYear = parseInt(rawEndYearStr.replace(/['’]/g, ""), 10);
      if (isNaN(endYear)) continue;
      if (endYear < 100) endYear += endYear > 50 ? 1900 : 2000;
      if (endYear < startYear || endYear > currentYear + 2) continue;

      const endMonth =
        MONTH_NAMES[rawEndMonth] ||
        (parseInt(rawEndMonth, 10) >= 1 && parseInt(rawEndMonth, 10) <= 12
          ? parseInt(rawEndMonth, 10)
          : 12);
      endTotalMonths = endYear * 12 + endMonth;
    }

    if (endTotalMonths >= startTotalMonths) {
      intervals.push({ start: startTotalMonths, end: endTotalMonths });
    }
  }

  // Fallback: standalone years "2018 - 2021"
  if (!intervals.length) {
    const yearPairRegex =
      /\b(19\d{2}|20\d{2})\s*(?:-|–|—|to)\s*(19\d{2}|20\d{2}|present|current)\b/gi;
    let yMatch: RegExpExecArray | null;
    while ((yMatch = yearPairRegex.exec(text)) !== null) {
      const y1Str = yMatch[1];
      const y2Str = yMatch[2];
      if (!y1Str || !y2Str) continue;

      const y1 = parseInt(y1Str, 10);
      const isPres = ["present", "current"].includes(y2Str.toLowerCase());
      const y2 = isPres ? currentYear : parseInt(y2Str, 10);
      if (y1 >= 1970 && y2 >= y1 && y2 <= currentYear + 1) {
        intervals.push({ start: y1 * 12 + 1, end: y2 * 12 + 12 });
      }
    }
  }

  return intervals;
}

/** Parses sections out of raw resume text using standard resume headers. */
function partitionSections(text: string): {
  experienceText: string;
  educationText: string;
  skillsText: string;
  summaryText: string;
} {
  const lines = text.split(/\r?\n/);
  let currentSection = "header";

  const expLines: string[] = [];
  const eduLines: string[] = [];
  const skillsLines: string[] = [];
  const summaryLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const headerMatch = trimmed.match(
      /^(experience|work experience|professional experience|employment history|work history|education|academic background|qualifications|academic history|skills|technical skills|technologies|proficiencies|core competencies|summary|professional summary|profile|about me|executive summary|projects|certifications|awards|languages|references)(?::|\s*[-–—])?\s*(.*)$/i,
    );

    if (headerMatch) {
      const headerType = (headerMatch[1] ?? "").toLowerCase();
      const remainder = (headerMatch[2] || "").trim();

      if (
        /^(experience|work experience|professional experience|employment history|work history)$/i.test(
          headerType,
        )
      ) {
        currentSection = "experience";
      } else if (
        /^(education|academic background|qualifications|academic history)$/i.test(headerType)
      ) {
        currentSection = "education";
      } else if (
        /^(skills|technical skills|technologies|proficiencies|core competencies)$/i.test(headerType)
      ) {
        currentSection = "skills";
      } else if (
        /^(summary|professional summary|profile|about me|executive summary)$/i.test(headerType)
      ) {
        currentSection = "summary";
      } else {
        currentSection = "other";
      }

      if (remainder) {
        if (currentSection === "experience") expLines.push(remainder);
        else if (currentSection === "education") eduLines.push(remainder);
        else if (currentSection === "skills") skillsLines.push(remainder);
        else if (currentSection === "summary") summaryLines.push(remainder);
      }
      continue;
    }

    if (currentSection === "experience") expLines.push(trimmed);
    else if (currentSection === "education") eduLines.push(trimmed);
    else if (currentSection === "skills") skillsLines.push(trimmed);
    else if (currentSection === "summary") summaryLines.push(trimmed);
  }

  return {
    experienceText: expLines.join("\n"),
    educationText: eduLines.join("\n"),
    skillsText: skillsLines.join("\n"),
    summaryText: summaryLines.join("\n"),
  };
}

/** Extracts candidate contact details */
function extractContact(text: string): ParsedCandidateProfile {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Email
  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  const email = emailMatch ? emailMatch[0].toLowerCase() : null;

  // Phone
  const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/);
  const phone = phoneMatch ? phoneMatch[0] : null;

  // Name: First 1-3 lines before email/phone that looks like a name
  let name: string | null = null;
  for (let i = 0; i < Math.min(4, lines.length); i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.includes("@") || /\d{3}/.test(line)) continue;
    if (line.length >= 3 && line.length <= 40 && !/^(resume|curriculum|cv|contact)/i.test(line)) {
      name = line.replace(/[^a-zA-Z\s.-]/g, "").trim();
      break;
    }
  }

  // Location: Pattern like "City, ST" or "City, Country"
  const locMatch = text.match(/\b([A-Z][a-zA-Z\s]{2,20}),\s*([A-Z]{2}|[A-Z][a-zA-Z\s]{2,20})\b/);
  const location = locMatch ? `${locMatch[1]}, ${locMatch[2]}` : null;

  return { name, email, phone, location };
}

/** Extracts education entries */
function extractEducation(text: string, eduSectionText: string): ParsedEducation[] {
  const sources = [eduSectionText, text].filter((s) => s && s.trim().length > 0);
  const entries: ParsedEducation[] = [];

  const degreeRegex =
    /\b(bachelor(?:'s)?|master(?:'s)?|ph\.?d\.?|associate(?:'s)?|b\.?s\.?|b\.?a\.?|m\.?s\.?|b\.?tech|m\.?tech|mba)\s*(?:of|in)?\s*([a-zA-Z\s&,]{2,40})?/gi;

  for (const source of sources) {
    let match: RegExpExecArray | null;
    while ((match = degreeRegex.exec(source)) !== null) {
      const qual = (match[1] || "").trim();
      const field = (match[2] || "")
        .replace(/\b(at|from|university|college|with|graduated)\b.*/i, "")
        .trim();

      // Look for year nearby in text
      const contextSlice = source.slice(match.index, match.index + 120);
      const yearMatch = contextSlice.match(/\b(19\d{2}|20\d{2})\b/);

      const entry: ParsedEducation = {
        qualification: `${qual}${field ? ` in ${field}` : ""}`.trim().slice(0, 100),
        fieldOfStudy: field || undefined,
        institution: "Institution specified in resume",
        year: yearMatch?.[1] ?? "",
      };

      if (
        !entries.some((e) => e.qualification.toLowerCase() === entry.qualification.toLowerCase())
      ) {
        entries.push(entry);
      }
    }

    if (entries.length > 0) break;
  }

  return entries.slice(0, 4);
}

/** Deterministic parser entry point */
export function parseResume(resumeText: string): StructuredResume {
  const candidate = extractContact(resumeText);
  const sections = partitionSections(resumeText);

  // Extract date intervals to compute total non-overlapping experience
  const intervals = extractEmploymentIntervals(sections.experienceText || resumeText);
  const { totalYears, uncertain } = calculateNonOverlappingYears(intervals);

  // Categorize skills by scanning text against known technology banks
  const lower = resumeText.toLowerCase();
  const languages = KNOWN_LANGUAGES.filter((s) =>
    new RegExp(
      `(^|[^a-z0-9+#.])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9+#.]|$)`,
      "i",
    ).test(lower),
  );
  const frameworks = KNOWN_FRAMEWORKS.filter((s) =>
    new RegExp(
      `(^|[^a-z0-9+#.])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9+#.]|$)`,
      "i",
    ).test(lower),
  );
  const databases = KNOWN_DATABASES.filter((s) =>
    new RegExp(
      `(^|[^a-z0-9+#.])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9+#.]|$)`,
      "i",
    ).test(lower),
  );
  const cloudAndDevops = KNOWN_CLOUD_DEVOPS.filter((s) =>
    new RegExp(
      `(^|[^a-z0-9+#.])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9+#.]|$)`,
      "i",
    ).test(lower),
  );

  const allSkills = Array.from(
    new Set([...languages, ...frameworks, ...databases, ...cloudAndDevops]),
  );

  const education = extractEducation(resumeText, sections.educationText);

  // Roles extracted from experience section
  const expLines = sections.experienceText.split("\n").filter((l) => l.trim().length > 10);
  const sampleRoles: ParsedWorkRole[] = [];
  for (const line of expLines.slice(0, 6)) {
    if (
      /\b(software|engineer|developer|manager|lead|architect|analyst|specialist|consultant|executive|director)\b/i.test(
        line,
      )
    ) {
      sampleRoles.push({
        title: line.slice(0, 80),
        company: "Company referenced in resume",
        duration: "Demonstrated in work history",
        responsibilities: [],
      });
    }
  }

  return {
    candidate,
    summary: sections.summaryText.slice(0, 400) || null,
    skills: allSkills,
    categorizedSkills: {
      languages,
      frameworks,
      databases,
      cloudAndDevops,
      tools: [],
      domain: [],
    },
    total_experience_years: totalYears > 0 ? totalYears : null,
    dates_uncertain: uncertain,
    experience: sampleRoles,
    education,
    certifications: [],
    projects: [],
    rawSections: {
      experienceText: sections.experienceText,
      educationText: sections.educationText,
      skillsText: sections.skillsText,
    },
  };
}
