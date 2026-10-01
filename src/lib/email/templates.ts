import { brand } from "../config";
import { REPLY_MARKER } from "./parse-reply";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Layout = {
  heading: string;
  bodyText: string;
  action?: { label: string; url: string };
  replyable?: boolean;
  links?: { heading: string; items: { label: string; url: string }[] };
};

export function renderEmail({ heading, bodyText, action, replyable, links }: Layout): { text: string; html: string } {
  const text = [
    replyable ? REPLY_MARKER : null,
    replyable ? "" : null,
    heading,
    "",
    bodyText,
    links ? `\n${links.heading}\n${links.items.map((l) => `- ${l.label}: ${l.url}`).join("\n")}` : null,
    action ? `\n${action.label}: ${action.url}` : null,
    "",
    `— ${brand.name}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const paragraphs = escapeHtml(bodyText)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;white-space:pre-wrap">${p}</p>`)
    .join("");

  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${escapeHtml(heading)}</title></head><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2933">
${replyable ? `<div style="color:#4b5563;font-size:12px;padding:12px 24px">${escapeHtml(REPLY_MARKER)}</div>` : ""}
<div style="max-width:560px;margin:16px auto;background:#fff;border-radius:8px;padding:24px;border:1px solid #e4e7eb">
<div style="font-size:13px;color:#52606d;margin-bottom:16px">${escapeHtml(brand.name)}</div>
<h1 style="font-size:18px;margin:0 0 16px">${escapeHtml(heading)}</h1>
${paragraphs}
${
  links
    ? `<p style="margin:16px 0 8px">${escapeHtml(links.heading)}</p><ul style="margin:0;padding-left:20px">${links.items
        .map((l) => `<li style="margin:6px 0"><a href="${escapeHtml(l.url)}" style="color:#2f4ac4;font-weight:600">${escapeHtml(l.label)}</a></li>`)
        .join("")}</ul>`
    : ""
}
${action ? `<p style="margin:20px 0 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#2f54eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600">${escapeHtml(action.label)}</a></p>` : ""}
${replyable ? `<p style="font-size:12px;color:#4b5563;margin-top:24px">You can reply to this email directly to add a comment to the ticket.</p>` : ""}
</div></body></html>`;

  return { text, html };
}

export function magicLinkEmail(url: string) {
  return {
    subject: `Sign in to ${brand.name}`,
    ...renderEmail({
      heading: `Sign in to ${brand.name}`,
      bodyText: "Use the button below to sign in. This link expires in 15 minutes and can only be used once.\n\nIf you didn't request this, you can ignore this email.",
      action: { label: "Sign in", url },
    }),
  };
}
