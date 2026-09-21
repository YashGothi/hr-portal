# Roadmap

## Done

- Candidate pipeline opening filter and cleaner LinkedIn application-link display.
- LinkedIn job posts: job ID, requirements, deadline, draft/active/closed, public application link + LinkedIn CTA copy.
- Public application page /apply/:jobCode with resume upload (PDF/DOC/DOCX), validation, progress, application ID.
- Private resume storage (resumes bucket) with HR-only signed links.
- ATS engine: server-side text extraction, AI structured analysis, weighted score computed in code, categories, re-run + evaluation history.
- HR applications table (source, experience, score, category, statuses, resume, re-run) and full ATS analysis on the candidate profile.
- Candidate self-scheduling: secure /schedule/:token booking page, 20-min screening + 30-min interview, working hours 11-18 with 13-14 break, blocked time, database-level double-booking guard, ICS invites, HR day/week calendar and availability settings.

## Open (blocked on user action)

- Real email delivery: waiting on the TXT + `hr` NS records in the active Cloudflare zone for seceon.com.
- Notion connection is live but nothing in the app reads from it yet.
