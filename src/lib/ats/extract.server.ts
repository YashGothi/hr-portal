/** Server-only resume text extraction for PDF and DOCX files. */

export class ResumeTextError extends Error {}

export type ResumeParsingQuality = "parsed" | "partially_parsed" | "parsing_failed";

export type QualityAssessment = {
  quality: ResumeParsingQuality;
  reason?: string;
  hasExperienceSection: boolean;
  hasEducationSection: boolean;
  hasSkillsSection: boolean;
  wordCount: number;
};

const UNREADABLE = "Unable to extract readable text from resume.";

/** Evaluates the extracted text for completeness and readability. */
export function assessTextQuality(text: string): QualityAssessment {
  const trimmed = text.trim();
  if (trimmed.length < 80) {
    return {
      quality: "parsing_failed",
      reason:
        "Extracted text is empty or too short (< 80 characters). Scanned images require manual review.",
      hasExperienceSection: false,
      hasEducationSection: false,
      hasSkillsSection: false,
      wordCount: 0,
    };
  }

  // Check character garble ratio (replacement characters or unprintable controls)
  let nonPrintableCount = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 0xfffd) {
      nonPrintableCount++;
    }
  }
  if (nonPrintableCount / trimmed.length > 0.08) {
    return {
      quality: "parsing_failed",
      reason: "Extracted document contains high proportion of unreadable/corrupted characters.",
      hasExperienceSection: false,
      hasEducationSection: false,
      hasSkillsSection: false,
      wordCount: 0,
    };
  }

  const lower = trimmed.toLowerCase();
  const words = trimmed.split(/\s+/).filter(Boolean);

  const hasExperienceSection =
    /\b(experience|work history|employment|work experience|professional background|career history)\b/i.test(
      lower,
    );
  const hasEducationSection =
    /\b(education|academic|university|degree|college|bachelor|master|b\.s\.|m\.s\.|b\.tech|phd)\b/i.test(
      lower,
    );
  const hasSkillsSection =
    /\b(skills|technical skills|competencies|technologies|proficiencies|tech stack)\b/i.test(lower);

  const sectionCount = [hasExperienceSection, hasEducationSection, hasSkillsSection].filter(
    Boolean,
  ).length;

  if (words.length < 30 || sectionCount === 0) {
    return {
      quality: "partially_parsed",
      reason: "Document lacks standard resume sections (Experience, Education, Skills).",
      hasExperienceSection,
      hasEducationSection,
      hasSkillsSection,
      wordCount: words.length,
    };
  }

  return {
    quality: "parsed",
    hasExperienceSection,
    hasEducationSection,
    hasSkillsSection,
    wordCount: words.length,
  };
}

export async function extractResumeText(bytes: Uint8Array, fileType: string): Promise<string> {
  let text = "";

  if (fileType === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    try {
      const pdf = await getDocumentProxy(bytes);
      const result = await extractText(pdf, { mergePages: true });
      text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
    } catch {
      throw new ResumeTextError(UNREADABLE);
    }
  } else if (fileType === "docx") {
    const mammoth = await import("mammoth");
    try {
      const result = await mammoth.extractRawText({
        buffer: Buffer.from(bytes) as unknown as Buffer,
      });
      text = result.value;
    } catch {
      throw new ResumeTextError(UNREADABLE);
    }
  } else {
    throw new ResumeTextError(
      "This resume format cannot be read automatically. Ask the candidate for a PDF or DOCX file.",
    );
  }

  const cleaned = text
    .split("\0")
    .join(" ")
    .replace(/[ \t]+/g, " ")
    .trim();

  if (cleaned.length < 80) {
    throw new ResumeTextError(
      "The submitted file contains no machine-readable text. It may be a scanned image. Please submit a text-based resume.",
    );
  }

  return cleaned.slice(0, 25000);
}
