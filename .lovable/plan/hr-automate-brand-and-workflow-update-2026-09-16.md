# HR-Automate brand and workflow update

## What will change

- Rename all visible Hirestream branding and page titles to **HR-Automate**.
- Replace the current sparkle with a polished emerald wordmark-and-symbol logo, and derive the favicon from the same symbol.
- Add an accessible light/dark toggle at the top right, remember the choice, and support the system theme initially.
- Retheme the interface from black/blue-teal to a black/emerald palette in dark mode and a crisp neutral/emerald palette in light mode.
- Add an **Edit** action to every job opening card, prefill the existing details, save changes, and refresh the cards.
- Connect interview scheduling and calendar drag-rescheduling to automatic invite and reschedule emails.

## Email prerequisite

- The project currently has no sender domain configured. I will prepare the app-side email triggers only after the domain is configured, because real candidate emails cannot be scaffolded or delivered before that prerequisite is complete.
- Once available, scheduling sends an interview invitation and dragging an interview to a new date sends a reschedule notice automatically. A failed email will be surfaced clearly without hiding the saved calendar change.

## Technical details

- Keep the existing TanStack routes, data access, security policies, and candidate workflows intact.
- Use semantic theme tokens for both modes and prevent a theme flash during page load.
- Reuse one job form for create/edit to avoid duplicated behavior.
- Send emails from authenticated server functions rather than the browser, with candidate and interview details validated before sending.
- Verify desktop/mobile layouts, editing, theme persistence, calendar drag behavior, and the final build.
