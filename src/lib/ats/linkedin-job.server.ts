/** Server-side extraction engine for LinkedIn job postings. */

export type ExtractedLinkedInJob = {
  title: string;
  department: string;
  location: string;
  employment_type: string;
  required_skills: string[];
  preferred_skills: string[];
  min_experience_years: number | null;
  max_experience_years: number | null;
  education_requirement: string;
  description: string;
  job_code: string;
};

const COMMON_SKILLS = [
  "JavaScript",
  "TypeScript",
  "React",
  "Node.js",
  "Python",
  "Java",
  "C++",
  "C#",
  "Go",
  "Rust",
  "SQL",
  "PostgreSQL",
  "MongoDB",
  "AWS",
  "Azure",
  "GCP",
  "Docker",
  "Kubernetes",
  "Git",
  "Linux",
  "GraphQL",
  "REST API",
  "Tailwind CSS",
  "Next.js",
  "Vite",
  "Cybersecurity",
  "Network Security",
  "IDS/IPS",
  "SIEM",
  "Penetration Testing",
  "DevOps",
  "CI/CD",
  "Agile",
  "Scrum",
  "Machine Learning",
  "AI",
  "Data Analysis",
  "Product Management",
  "UI/UX Design",
  "Project Management",
];

function cleanHtmlText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseExperienceYears(text: string): { min: number | null; max: number | null } {
  const match = text.match(/(\d+)\s*(?:-|to)\s*(\d+)\s*\+?\s*years?/i);
  if (match && match[1] && match[2]) {
    return { min: parseInt(match[1], 10), max: parseInt(match[2], 10) };
  }

  const singleMatch = text.match(/(\d+)\s*\+?\s*years?\b/i);
  if (singleMatch && singleMatch[1]) {
    const val = parseInt(singleMatch[1], 10);
    return { min: val, max: null };
  }

  return { min: null, max: null };
}

function extractSkills(text: string): { required: string[]; preferred: string[] } {
  const found: string[] = [];
  const lower = text.toLowerCase();

  for (const skill of COMMON_SKILLS) {
    const pattern = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(lower)) {
      found.push(skill);
    }
  }

  // Attempt to parse bullet points or explicit skill sections
  const reqMatch = text.match(
    /(?:required|key|must have)\s+skills?:?([\s\S]*?)(?:preferred|nice to have|qualifications|responsibilities|$)/i,
  );
  const prefMatch = text.match(
    /(?:preferred|nice to have|plus|bonus)\s+skills?:?([\s\S]*?)(?:responsibilities|requirements|$)/i,
  );

  const required: string[] = [];
  const preferred: string[] = [];

  if (reqMatch && reqMatch[1]) {
    const reqChunk = reqMatch[1];
    found.forEach((s) => {
      if (reqChunk.toLowerCase().includes(s.toLowerCase())) {
        required.push(s);
      }
    });
  }

  if (prefMatch && prefMatch[1]) {
    const prefChunk = prefMatch[1];
    found.forEach((s) => {
      if (prefChunk.toLowerCase().includes(s.toLowerCase())) {
        preferred.push(s);
      }
    });
  }

  // Assign remaining skills to required if not categorized
  found.forEach((s) => {
    if (!required.includes(s) && !preferred.includes(s)) {
      required.push(s);
    }
  });

  return {
    required: required.slice(0, 10),
    preferred: preferred.slice(0, 8),
  };
}

function parseEducation(text: string): string {
  if (/master|m\.s|mba|phd/i.test(text)) {
    return "Master's Degree or higher in Computer Science, Engineering, or relevant field";
  }
  if (/bachelor|b\.s|degree/i.test(text)) {
    return "Bachelor's Degree in Computer Science, Information Technology, or relevant field";
  }
  return "";
}

function generateJobCode(title: string): string {
  const letters =
    title
      .replace(/[^A-Za-z]/g, "")
      .slice(0, 3)
      .toUpperCase() || "JOB";
  const num = Math.floor(1000 + Math.random() * 9000);
  return `LNK-${letters}-${num}`;
}

export async function extractLinkedInJobDetails(input: {
  url?: string;
  text?: string;
}): Promise<ExtractedLinkedInJob> {
  let rawText = (input.text || "").trim();
  let title = "";
  let department = "";
  let location = "";
  let employmentType = "Full-time";
  let description = "";

  if (input.url && input.url.startsWith("http")) {
    try {
      const res = await fetch(input.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      if (res.ok) {
        const html = await res.text();

        // 1. Try schema.org/JobPosting embedded in script tag
        const jsonLdMatch = html.match(
          /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi,
        );
        if (jsonLdMatch) {
          for (const block of jsonLdMatch) {
            try {
              const content = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");
              const parsed = JSON.parse(content);
              const data = Array.isArray(parsed)
                ? parsed.find((item) => item["@type"] === "JobPosting")
                : parsed["@type"] === "JobPosting"
                  ? parsed
                  : null;

              if (data) {
                if (data.title) title = data.title;
                if (data.jobLocation?.address?.addressLocality) {
                  location = `${data.jobLocation.address.addressLocality}${
                    data.jobLocation.address.addressRegion
                      ? `, ${data.jobLocation.address.addressRegion}`
                      : ""
                  }`;
                }
                if (data.employmentType) {
                  employmentType = Array.isArray(data.employmentType)
                    ? data.employmentType[0]
                    : data.employmentType;
                }
                if (data.description) {
                  description = cleanHtmlText(data.description);
                  rawText = `${title} ${description} ${rawText}`;
                }
                if (data.hiringOrganization?.name) {
                  department = data.hiringOrganization.name;
                }
                break;
              }
            } catch {
              // Ignore invalid JSON-LD blocks
            }
          }
        }

        // 2. OpenGraph Meta Tags fallback
        if (!title) {
          const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
          if (ogTitle && ogTitle[1])
            title = ogTitle[1]
              .replace(/\s*\|.*$/, "")
              .replace(/\s*-.*$/, "")
              .trim();
        }

        if (!description) {
          const ogDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
          if (ogDesc && ogDesc[1]) description = ogDesc[1].trim();
        }

        if (!rawText) {
          rawText = cleanHtmlText(html);
        }
      }
    } catch {
      // Fallback to text parsing if URL fetch is blocked
    }
  }

  // Fallback title extraction from raw text if missing
  if (!title && rawText) {
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length > 0 && lines[0]) {
      title = lines[0].slice(0, 100);
    }
  }

  if (!title) {
    title = "Software Engineer (LinkedIn Import)";
  }

  if (!description && rawText) {
    description = rawText.slice(0, 3000);
  }

  // Normalize employment type
  if (/part-time|part time/i.test(rawText)) employmentType = "Part-time";
  else if (/contract|freelance/i.test(rawText)) employmentType = "Contract";
  else if (/internship|intern/i.test(rawText)) employmentType = "Internship";
  else employmentType = "Full-time";

  // Normalize location
  if (!location) {
    if (/remote/i.test(rawText)) location = "Remote";
    else if (/hybrid/i.test(rawText)) location = "Hybrid";
    else location = "On-site";
  }

  const { min, max } = parseExperienceYears(rawText);
  const skills = extractSkills(rawText);
  const education = parseEducation(rawText);

  return {
    title: title.trim(),
    department: department.trim() || "Engineering",
    location: location.trim(),
    employment_type: employmentType,
    required_skills: skills.required,
    preferred_skills: skills.preferred,
    min_experience_years: min,
    max_experience_years: max,
    education_requirement: education,
    description: description.trim() || rawText.slice(0, 2000),
    job_code: generateJobCode(title),
  };
}
