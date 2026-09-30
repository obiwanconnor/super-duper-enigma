export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
};

function parseFrom(from: string): { email: string; name?: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || undefined, email: m[2] } : { email: from.trim() };
}

/**
 * Sends via the SendGrid v3 API. Without SENDGRID_API_KEY (local development)
 * the message is printed to the server console instead.
 */
export async function sendEmail(msg: OutgoingEmail): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = parseFrom(process.env.EMAIL_FROM ?? "s6a Support <support@s6a.io>");

  if (!apiKey) {
    console.info(
      `\n--- email (SENDGRID_API_KEY not set) ---\nTo: ${msg.to}\nReply-To: ${msg.replyTo ?? "-"}\nSubject: ${msg.subject}\n\n${msg.text}\n---------------------------------------\n`,
    );
    return;
  }

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: msg.to }] }],
      from,
      ...(msg.replyTo ? { reply_to: { email: msg.replyTo } } : {}),
      subject: msg.subject,
      content: [
        { type: "text/plain", value: msg.text },
        { type: "text/html", value: msg.html },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`SendGrid error ${res.status}: ${await res.text()}`);
  }
}
