# Candidate opening filter and application links

## Changes

- Replace the second candidate-pipeline dropdown with a **Job opening** filter populated from existing openings.
- Filter both board and list views by the selected opening, while keeping the existing stage filter independent.
- Rename **Copy LinkedIn CTA** to clearer wording and keep the copied message as a ready-to-post application sentence.
- Show a clean `/apply/{job code}` path on opening cards while retaining a complete working URL when copied.

## URL limitation

A public application link needs a hostname. The current project has no custom domain, so `lovable.app` cannot be removed from a working external link yet. Once a custom domain is connected, copied links will automatically use that domain.

## Verification

- Confirm opening selection updates the pipeline candidates in board and list views.
- Confirm the copied LinkedIn text contains the selected opening's working application link.
- Check the candidate pipeline and openings pages at the current preview size.
