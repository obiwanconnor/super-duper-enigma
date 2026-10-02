import { appUrl, brand } from "./config";
import { sendEmail } from "./email/send";
import { renderEmail } from "./email/templates";

export async function sendInvitation(email: string, inviterName: string) {
  const url = appUrl(`/login?email=${encodeURIComponent(email)}`);
  const { text, html } = renderEmail({
    heading: `You've been invited to ${brand.name}`,
    bodyText: `${inviterName} has given you access to ${brand.name}, where you can raise support requests, follow their progress and browse help articles.`,
    action: { label: "Sign in", url },
  });
  await sendEmail({ to: email, subject: `Your access to ${brand.name}`, text, html });
}
