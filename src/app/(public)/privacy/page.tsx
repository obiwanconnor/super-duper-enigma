import { brand } from "@/lib/config";
import { RETENTION_YEARS } from "@/lib/retention";

export const metadata = { title: "Privacy notice" };

const LAST_UPDATED = "1 October 2026";

export default function PrivacyPage() {
  const { legalName, privacyEmail } = brand;
  return (
    <>
      <h1>Privacy notice</h1>
      <p>Last updated {LAST_UPDATED}.</p>
      <p>
        This notice explains how {legalName} (&ldquo;we&rdquo;) uses personal information in the {brand.name}, where our clients&apos; staff raise and
        track support requests for software we build and support. We are the controller for this information under the UK GDPR and the Data
        Protection Act 2018.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your name, work email address, the organisation you work for and, if you sign in with Microsoft, Google
          or your company&apos;s single sign-on, an identifier from that provider.
        </li>
        <li>
          <strong>Support records:</strong> tickets, replies and files you send us through the portal or by email, and your satisfaction ratings.
        </li>
        <li>
          <strong>Technical information:</strong> sign-in sessions and records of changes made in the portal (an audit log), kept for security
          and accountability.
        </li>
      </ul>

      <h2>Why we use it and our lawful basis</h2>
      <ul>
        <li>
          To provide the support service in our contract with your employer: <em>legitimate interests</em> (yours, your employer&apos;s and ours in
          resolving support requests).
        </li>
        <li>To keep the portal secure and to show who changed what: <em>legitimate interests</em>.</li>
        <li>To send you emails about your tickets and sign-in links: <em>legitimate interests</em>.</li>
      </ul>

      <h2>AI-assisted triage</h2>
      <p>
        Unless your organisation has opted out, new tickets and replies are processed by an AI model (Claude, provided by Anthropic) to suggest a
        category and priority, ask for missing details, and draft replies. Questions asking for missing details are sent to you automatically and are
        labelled as coming from the AI assistant. Every other reply is reviewed and sent by a member of our support team. The AI does not make
        decisions that have legal or similarly significant effects on you.
      </p>

      <h2>Who we share it with</h2>
      <p>We use these service providers (processors), under contracts requiring them to protect your information:</p>
      <ul>
        <li>Vercel: hosting the portal and storing attached files.</li>
        <li>Our managed PostgreSQL database provider: storing portal data.</li>
        <li>Twilio SendGrid: sending and receiving email.</li>
        <li>Anthropic: AI-assisted triage, as described above.</li>
        <li>Microsoft, Google or your company&apos;s identity provider, if you use them to sign in.</li>
      </ul>
      <p>
        Some of these providers process data outside the UK, including in the United States. Where they do, we rely on UK adequacy regulations or
        the UK International Data Transfer Addendum to protect it.
      </p>
      <p>People at your organisation who use the portal can see your organisation&apos;s tickets, including ones you raise.</p>

      <h2>How long we keep it</h2>
      <p>
        We keep support records for as long as we provide support to your organisation and for {RETENTION_YEARS} years after our contract ends, then
        delete them. If you leave your organisation, your account can be deactivated, and on request your name and email can be removed from the
        records we keep.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask for a copy of your personal information, and ask us to correct it, erase it, restrict how we use it, or object to our use of it.
        To make a request, email <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>. We&apos;ll respond within one month.
      </p>

      <h2>Complaints</h2>
      <p>
        If you&apos;re unhappy with how we&apos;ve handled your information, please contact us first at <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.
        You can also complain to the Information Commissioner&apos;s Office (ICO) at <a href="https://ico.org.uk/make-a-complaint/">ico.org.uk/make-a-complaint</a>{" "}
        or by phone on 0303 123 1113.
      </p>
    </>
  );
}
