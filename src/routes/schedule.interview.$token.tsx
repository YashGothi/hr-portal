import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Friendly interview scheduling URL from the invitation email. It hands off to
 * the existing candidate booking page with the interview type preselected.
 */
export const Route = createFileRoute("/schedule/interview/$token")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/schedule/$token",
      params: { token: params.token },
      search: { type: "interview" },
    });
  },
});
