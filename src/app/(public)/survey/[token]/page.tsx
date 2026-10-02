import Link from "next/link";
import { db } from "@/lib/db";
import { canViewTicket } from "@/lib/access";
import { parseSurveyToken, RATINGS, ratingLabels, type Rating } from "@/lib/survey";
import { SurveyForm } from "@/components/survey-form";
import { submitSurvey } from "../actions";

export const metadata = { title: "Rate our support" };

/**
 * Reached from the link in a "resolved" email. Visiting the page never
 * records anything (email scanners follow links); the person submits the form.
 */
export default async function SurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ rating?: string; done?: string; error?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const parsed = parseSurveyToken(decodeURIComponent(token), process.env.AUTH_SECRET ?? "");
  const [ticket, user] = parsed
    ? await Promise.all([
        db.ticket.findUnique({ where: { number: parsed.ticketNumber }, include: { satisfaction: true } }),
        db.user.findUnique({ where: { id: parsed.userId } }),
      ])
    : [null, null];

  if (!parsed || !ticket || !user || !user.active || !canViewTicket(user, ticket)) {
    return (
      <>
        <h1>This link isn&apos;t valid</h1>
        <p>
          The feedback link may be incomplete or no longer active. You can still rate a resolved ticket from its page after you{" "}
          <Link href="/login">sign in</Link>.
        </p>
      </>
    );
  }

  if (sp.done) {
    return (
      <>
        <h1>Thank you for your feedback</h1>
        <p role="status">We&apos;ve recorded your rating for ticket #{ticket.number}.</p>
        <p>
          <Link href={`/tickets/${ticket.number}`}>View the ticket</Link>
        </p>
      </>
    );
  }

  const preselected = RATINGS.includes(sp.rating as Rating) ? (sp.rating as Rating) : (ticket.satisfaction?.rating ?? null);
  return (
    <>
      <h1>How did we do?</h1>
      <p>
        Ticket #{ticket.number}: {ticket.subject}
      </p>
      {sp.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {sp.error === "rate" ? "Too many submissions for this link. Please try again later." : "Please choose a rating."}
        </p>
      )}
      {ticket.satisfaction && <p>You rated this ticket {ratingLabels[ticket.satisfaction.rating].toLowerCase()}. You can change your rating below.</p>}
      <div className="not-prose card mt-4 p-5">
        <SurveyForm
          action={submitSurvey}
          hidden={{ token: decodeURIComponent(token) }}
          legend="How would you rate the support you received?"
          selected={preselected}
          comment={ticket.satisfaction?.userId === user.id ? ticket.satisfaction.comment : null}
        />
      </div>
    </>
  );
}
