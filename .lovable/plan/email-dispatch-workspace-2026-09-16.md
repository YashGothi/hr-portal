# Email Dispatch workspace

## What will change

- Add an **Email Dispatch** item to the shared menu with the subtitle **Auto mailer & Templates**.
- Build a responsive workspace matching the provided structure while preserving HR-Automate’s black, white, and emerald visual system.
- Include four professional templates: shortlist and screening invite, interview invite, hired status, and rejected status. Document verification will not appear.
- Let HR choose a candidate and automatically personalize the recipient, subject, greeting, role, score, and closing.
- Add editable subject and message fields, interview/screening date and time controls, and a meeting-link field where relevant.
- Add preview/edit controls, local template saving, simulated individual and bulk dispatch actions, and a session-based delivery history clearly labeled as a preview.

## Behavior and safeguards

- Candidate options come from the existing pipeline and display name, role, and current stage.
- Bulk dispatch targets candidates appropriate to the selected template and always requires confirmation before adding mock history entries.
- No real messages are sent, no delivery status is claimed, and no email infrastructure or database changes are introduced.
- Template changes are stored only in the current browser so HR can safely explore the interface now.

## Technical details

- Add a protected TanStack page with complete route metadata and reuse existing candidate queries and design-system controls.
- Use the existing date picker pattern with an interactive calendar popover and separate time input.
- Keep the page usable on compact screens with stacked sections, overflow-safe controls, and no changes to existing workflows.
- Verify the page, template personalization, scheduling controls, bulk confirmation, delivery-history mockups, light/dark themes, and compact layout.
