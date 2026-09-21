# Navigation, pipeline, and applicant overview updates

## What will change

- Move **Sign out** out of the sidebar and page action area into the shared top-right utility row beside the day/night toggle, including compact screens.
- Add consistent vertical spacing above the full-width **Stage distribution** card.
- Reorder the pipeline so **Status** appears before **Email sent**, and rename **Offer Sent** to **Email sent** everywhere stage labels are shown.
- Add a full-width applicant card below the LinkedIn resume upload and screening results. It will show all candidates for the selected opening, with each candidate’s ATS score and a link to their profile.
- Keep the selected opening’s applicant list current after imports without adding extra page requests.

## Technical details

- Reuse the shared app header so navigation behavior stays consistent across all authenticated pages.
- Derive the opening-specific applicant list from the existing cached candidates and jobs data, with compact loading, empty, and no-opening-selected states.
- Keep the pipeline’s existing drag-and-drop and stage selectors unchanged while adjusting display order and wording.
- Verify compact and desktop layouts, theme controls, pipeline ordering, applicant filtering, and the final build.
