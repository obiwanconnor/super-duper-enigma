import { brand } from "@/lib/config";

export const metadata = { title: "Accessibility statement" };

const PREPARED = "1 October 2026";

export default function AccessibilityPage() {
  const email = brand.accessibilityEmail;
  return (
    <>
      <h1>Accessibility statement</h1>
      <p>
        This statement applies to the {brand.name} at support.s6a.io. {brand.legalName} wants as many people as possible to be able to use it. You
        should be able to:
      </p>
      <ul>
        <li>change colours, contrast levels and fonts using your browser or device settings</li>
        <li>choose a light or dark appearance, or have it follow your device</li>
        <li>zoom in up to 400% without text spilling off the screen</li>
        <li>navigate the whole portal using just a keyboard</li>
        <li>navigate the portal using speech recognition software</li>
        <li>use the portal with a screen reader</li>
        <li>sign in without having to remember a password or solve a puzzle</li>
      </ul>

      <h2>How accessible this portal is</h2>
      <p>
        We designed and built the portal to meet the Web Content Accessibility Guidelines (WCAG) version 2.2 at level AA. Every page is tested
        automatically against these guidelines in both light and dark appearance before each release.
      </p>
      <p>We know some parts may not be fully accessible:</p>
      <ul>
        <li>Files attached to tickets, such as screenshots and PDFs, are provided by users and may not be accessible.</li>
        <li>Formatting in tickets and replies written by users, such as headings or images in Markdown, may not follow a logical structure.</li>
      </ul>

      <h2>Feedback and contact information</h2>
      <p>
        If you need information in a different format, find a problem not listed on this page, or think we&apos;re not meeting accessibility
        requirements, email <a href={`mailto:${email}`}>{email}</a>. We&apos;ll consider your request and reply within 5 working days.
      </p>
      <p>
        You can also raise any support request by email to <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a> instead of using the portal.
      </p>

      <h2>Enforcement procedure</h2>
      <p>
        If you&apos;re not happy with how we respond to your complaint, contact the{" "}
        <a href="https://www.equalityadvisoryservice.com/">Equality Advisory and Support Service (EASS)</a>.
      </p>

      <h2>Technical information about this portal&apos;s accessibility</h2>
      <h3>Compliance status</h3>
      <p>
        We believe this portal is fully compliant with WCAG 2.2 level AA, apart from the user-provided content listed above. This assessment
        is based on automated testing and our own manual review. It has not yet been audited by an independent specialist.
      </p>

      <h2>Preparation of this accessibility statement</h2>
      <p>
        This statement was prepared on {PREPARED}. It was last reviewed on {PREPARED}. The portal was tested with automated tools (axe-core)
        across every page type, in light and dark appearance, by {brand.legalName}.
      </p>
    </>
  );
}
