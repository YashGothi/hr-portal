/** Parsing of a LinkedIn applicant export (CSV) into candidate rows. */

export const AUTO_SHORTLIST_SCORE = 85;

export type ImportRow = {
  full_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  applied_role: string | null;
  linkedin_url: string | null;
  resume_text: string | null;
};

/** Minimal RFC4180-style CSV reader (handles quotes, commas and newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < src.length; i += 1) {
    const char = src[i];
    if (quoted) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

const ALIASES: Record<keyof ImportRow, string[]> = {
  full_name: ["full name", "name", "candidate", "candidate name", "applicant"],
  email: ["email", "email address", "contact email"],
  phone: ["phone", "phone number", "mobile", "contact phone"],
  location: ["location", "city", "candidate location"],
  applied_role: ["job title", "role", "position", "applied role", "job"],
  linkedin_url: ["profile url", "linkedin profile", "linkedin url", "profile link", "profile"],
  resume_text: [
    "resume",
    "resume text",
    "cv",
    "headline",
    "summary",
    "about",
    "skills",
    "experience",
  ],
};

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

function firstNameLast(row: Record<string, string>): string {
  const first = clean(row["first name"]);
  const last = clean(row["last name"]);
  return [first, last].filter(Boolean).join(" ");
}

/**
 * Maps a LinkedIn export into candidate rows. Any resume-ish columns
 * (headline, summary, skills, experience) are combined into the resume text
 * the AI screening reads.
 */
export function mapLinkedInRows(rows: string[][]): { rows: ImportRow[]; skipped: number } {
  if (rows.length < 2) return { rows: [], skipped: 0 };
  const headers = rows[0]!.map(norm);
  const out: ImportRow[] = [];
  let skipped = 0;

  for (const raw of rows.slice(1)) {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = clean(raw[index]);
    });

    const pick = (key: keyof ImportRow): string => {
      for (const alias of ALIASES[key]) {
        if (record[alias]) return record[alias]!;
      }
      return "";
    };

    const name = pick("full_name") || firstNameLast(record);
    const email = pick("email");
    if (!name || !email) {
      skipped += 1;
      continue;
    }

    const resumeParts = ALIASES.resume_text
      .map((alias) => (record[alias] ? `${alias.toUpperCase()}: ${record[alias]}` : ""))
      .filter(Boolean);

    out.push({
      full_name: name,
      email,
      phone: pick("phone") || null,
      location: pick("location") || null,
      applied_role: pick("applied_role") || null,
      linkedin_url: pick("linkedin_url") || null,
      resume_text: resumeParts.length ? resumeParts.join("\n\n") : null,
    });
  }

  return { rows: out, skipped };
}

export function parseLinkedInExport(text: string) {
  return mapLinkedInRows(parseCsv(text));
}

/** Turns an applicant's resume PDF text into a candidate row. */
export function rowFromResumeText(text: string, fileName: string): ImportRow {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? "";
  const phone = text.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[1]?.trim() ?? null;
  const linkedin = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/i)?.[0] ?? null;

  const nameFromFile = fileName
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(resume|cv|final|updated|\d+)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const looksLikeName = (line: string) =>
    /^[A-Za-z][A-Za-z.'-]*(\s+[A-Za-z][A-Za-z.'-]*){1,3}$/.test(line) &&
    !line.includes("@") &&
    line.length <= 48;

  const nameFromText = lines.slice(0, 6).find(looksLikeName) ?? "";
  const full_name = nameFromText || nameFromFile || fileName;

  const roleKeywords =
    /engineer|developer|designer|manager|analyst|scientist|lead|intern|consultant|architect|specialist|associate|executive|accountant/i;
  const roleLine = lines
    .slice(0, 10)
    .find(
      (line) =>
        roleKeywords.test(line) &&
        !line.includes("|") &&
        !line.includes("@") &&
        !/\b(linkedin|github|profile|experience|education|skills|projects|summary)\b/i.test(line) &&
        line !== full_name &&
        line.length <= 60,
    );
  const applied_role = roleLine ? roleLine.slice(0, 80) : null;

  return {
    full_name,
    email,
    phone,
    location: null,
    applied_role,
    linkedin_url: linkedin
      ? linkedin.startsWith("http")
        ? linkedin
        : `https://${linkedin}`
      : null,
    resume_text: text.trim() || null,
  };
}
