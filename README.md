# s6a Support Portal

A support portal for the software built by s6a. Client stakeholders raise and follow tickets and read help articles for their products. s6a staff triage, assign and answer tickets in the same app.

- **Ticketing**: tickets per product with type, priority, status and assignee. Replies are Markdown. Staff can add internal notes that clients never see. A client reply reopens resolved tickets automatically.
- **Knowledge base**: Markdown articles per product. Only signed-in people at that product's client organisation can read them.
- **Sign-in chosen per client**: each organisation picks its methods from an emailed sign-in link, Microsoft Entra ID, Google Workspace, or its own OIDC provider (SAML through an OIDC bridge).
- **Email via SendGrid**: notifications for new tickets, replies and status changes. Replying to a notification email adds a comment to the ticket, including its attachments.
- **AI first-line triage (Claude)**: classifies and prioritises new tickets, asks the client clarifying questions straight away, and drafts replies (often from the knowledge base) that staff approve before sending. Each client can opt out.
- **SLAs**: first-response and resolution targets per client and priority, counted in UK business hours, with breach alerts.
- **Attachments**: screenshots and files on tickets and replies, from the web or by email.
- **Staff dashboard**: queue health, response times against SLA, satisfaction, and monthly volumes per client.
- **Client conveniences**: service targets shown on each ticket, a Good / Okay / Poor satisfaction survey, and copying in colleagues.
- **Saved replies** for staff, with placeholders such as the requester's first name.
- **Client admins**: named people at each client manage their own colleagues and see their organisation's reports, with CSV export.
- **Service notices**: incident and maintenance notices per product, shown as a banner and emailed to affected clients, with duplicate tickets linked to them.
- **Security**: idle sign-out (staff after 8 hours, clients after 7 days, with a warning) and rate limiting on sign-in, inbound email and surveys.
- **Accessible**: built and tested to WCAG 2.2 AA, with light and dark appearance.
- **UK GDPR tooling**: a privacy notice, an audit log, personal data export, erasure, and retention review.

Stack: Next.js 16 (App Router, server actions), TypeScript, Auth.js v5, Prisma 6, PostgreSQL, Tailwind CSS 4. It is built to run on Vercel.

## Roles and structure

| Role | Who | Can |
|---|---|---|
| `CLIENT` | Stakeholder at a client | See all tickets for their organisation, raise and reply to tickets, mark them resolved or reopen them, read their products' articles |
| `CLIENT` + client admin | Named stakeholder(s), set by s6a admins | As above, plus invite and deactivate colleagues (**Team**) and see their organisation's figures and CSV export (**Reports**) |
| `AGENT` | s6a support staff | Everything across all clients: assign, change status and priority, add internal notes, write articles |
| `ADMIN` | s6a admin | As agent, plus manage client organisations, products, SLA targets, client users and staff |
| `AI` | The AI assistant (system user) | Posts clarifying questions; can never sign in |

An organisation has users and one or more **products**. Every ticket and article belongs to a product.

## Local development

```bash
cp .env.example .env          # set DATABASE_URL and AUTH_SECRET (npx auth secret);
                              # set APP_URL=http://localhost:3000 and remove AUTH_URL
npm install
npm run db:migrate            # create the schema
SEED_ADMIN_EMAIL=you@s6a.io SEED_DEMO=1 npm run db:seed
npm run dev
```

Sign in at http://localhost:3000 with your admin email. When `SENDGRID_API_KEY` is empty, emails, including sign-in links, are **printed to the server console**. The demo data includes a client user, `jane@acme.example`.

Run `npm test` for unit tests and `npm run typecheck` for types. For the browser suite, which covers accessibility in both themes plus feature tests, build first and point it at a database:

```bash
npm run build
npx playwright install chromium     # once
npm run test:e2e                    # needs DATABASE_URL and AUTH_SECRET in the environment
```

GitHub Actions (`.github/workflows/ci.yml`) runs all of this on every push and pull request, against a throwaway Postgres.

## Deploying to Vercel

The live portal runs at **https://support.s6a.io**.

1. Create a Postgres database (Neon, Supabase or Vercel Marketplace Postgres) and set `DATABASE_URL`.
2. Import the repo into Vercel. The `vercel-build` script runs `prisma migrate deploy` before `next build`.
   Under **Settings → Domains**, add `support.s6a.io` and redirect the `*.vercel.app` production domain to it. Sign-in cookies and links are tied to the host people arrive on, so there should be only one.
3. Set the environment variables from `.env.example`. At minimum set `DATABASE_URL`, `AUTH_SECRET`, `APP_URL` and `AUTH_URL` (both `https://support.s6a.io`), `SENDGRID_API_KEY`, `EMAIL_FROM`, `REPLY_DOMAIN`, `INBOUND_EMAIL_SECRET`, `ANTHROPIC_API_KEY` and `CRON_SECRET`.
   Under **Storage**, create a private **Blob** store and connect it to the project; this adds `BLOB_READ_WRITE_TOKEN`.
4. Create the first admin once, against the production database: `SEED_ADMIN_EMAIL=you@s6a.io npm run db:seed`.

### DNS records for s6a.io

| Host | Type | Value | Purpose |
|---|---|---|---|
| `support` | CNAME | `cname.vercel-dns.com` (Vercel shows the exact value) | The portal |
| `reply.support` | MX (priority 10) | `mx.sendgrid.net` | Inbound email replies |
| SendGrid domain authentication | CNAME ×3 | As shown by SendGrid for `s6a.io` | SPF/DKIM so mail from `support@s6a.io` is delivered |

## SendGrid

**Sending:** create an API key with *Mail Send* permission. Authenticate your sending domain and set `EMAIL_FROM` to an address on it.

**Reply by email:** every notification carries a personal `Reply-To` address of the form `ticket+<number>.<userId>.<signature>@REPLY_DOMAIN`. The signature is an HMAC over the ticket and the recipient, keyed on `AUTH_SECRET`. A reply is accepted only when the signature is valid, the sender matches the recipient it was issued to, and that person can still see the ticket. Quoted history is stripped.

1. Replies go to the subdomain `reply.support.s6a.io`. Point its MX record at `mx.sendgrid.net`. Mail for the rest of `s6a.io` is unaffected.
2. In SendGrid, go to **Settings → Inbound Parse** and add that host with this destination URL:
   `https://support.s6a.io/api/email/inbound?secret=<INBOUND_EMAIL_SECRET>`
   Leave "POST the raw, full MIME message" unticked.
3. Set `REPLY_DOMAIN` to the same subdomain.

> Changing `AUTH_SECRET` invalidates the reply addresses in emails already sent.

## AI first-line triage

When a ticket is raised, the portal sends it to Claude (`claude-opus-5-5` by default; override with `AI_MODEL`). It sends the ticket text, any screenshots and the published knowledge base articles for that product. The assessment is used like this:

| Output | What happens |
|---|---|
| Summary, type, priority, likely incident | Shown to staff in an **AI triage** panel. The ticket's type is set to the suggestion. The priority is **raised** if the AI rates it higher, but never lowered. |
| Clarifying questions | **Sent to the client immediately** as an "AI assistant" comment, and the ticket moves to *Waiting on client*. Used only when essential details are missing. |
| Draft reply | Shown to staff as a **Suggested reply**, with links to the articles it drew on. Staff edit it, then **Approve & send** or **Discard**. Nothing drafted reaches the client without approval. |

When the client replies, a fresh draft is produced. Staff can also redraft on demand.

- **Opt-out:** each client's settings page has *Use AI first-line triage for this client*. When it's off, none of that client's ticket content is sent to the AI. Without `ANTHROPIC_API_KEY`, AI is off everywhere.
- **Safety:** the prompt treats client text as untrusted data, and forbids promises about fixes, timelines or credits and revealing internal notes. Only clarifying questions skip human review. The request uses Anthropic's server-side refusal fallback, and a failed run is retried by the scheduled job up to three times.

## SLAs

Targets are set per client and priority under **Clients → organisation → SLA targets**. New clients start from these defaults:

| Priority | First response | Resolution |
|---|---|---|
| Urgent | 1 hour | 1 business day |
| High | 4 hours | 3 business days |
| Normal | 1 business day | 5 business days |
| Low | 2 business days | 10 business days |

- **Business time** is Monday–Friday, 09:00–17:00 UK time, excluding England & Wales bank holidays. A business day is 8 hours. Holidays up to 2028 are built in (`src/lib/sla/business-time.ts`); add more with `BANK_HOLIDAYS_EXTRA`.
- **First response** stops at the first real reply: an AI clarifying question, or a public reply from staff (including an approved AI draft). The automatic "we've received your request" email doesn't count.
- **Resolution** pauses while a ticket is *Waiting on client*, *Resolved* or *Closed*, and resumes if it's reopened.
- **Breach alerts:** `/api/cron/sla` runs every 15 minutes (`vercel.json`) and emails the assignee, or all staff if the ticket is unassigned, once per breached clock. Sub-daily cron jobs need a Vercel Pro plan. Vercel authenticates the job with `CRON_SECRET`.

## Attachments

- Files are stored in a **private** Vercel Blob store and only served through `/api/attachments/<id>`, which checks the viewer can see the ticket. Clients never receive files from internal notes.
- PNG, JPEG, GIF and WebP images display inline. Everything else is forced to download, so an uploaded HTML or SVG file can't run inside the portal.
- Web uploads are limited to 5 files and 4 MB per message, because Vercel functions accept request bodies up to 4.5 MB. Email attachments up to 10 MB each are kept, but inline images such as signature logos are skipped. SendGrid posts the whole email to the webhook, so emails over about 4.5 MB in total will be rejected by Vercel.
- Without `BLOB_READ_WRITE_TOKEN`, files are written to `./.uploads` (development only).

## Accessibility (WCAG 2.2 AA)

The portal targets WCAG 2.2 level AA. It provides:

- A skip link; labelled `header`, `nav`, `main` and `footer` landmarks; one `h1` per page; and the current page marked with `aria-current`.
- Visible labels on every form field, with hints linked by `aria-describedby`. Errors are announced with `role="alert"` and confirmations with `role="status"`.
- Contrast of at least 4.5:1 for text and 3:1 for form-field borders, in both themes.
- Links underlined, and a 3px focus outline on every interactive element.
- Targets at least 24×24px (WCAG 2.5.8).
- Status and SLA states always shown as text, never by colour alone.
- Data tables with captions and header scopes.
- Sign-in by email link or SSO, with no passwords or puzzles (Accessible Authentication, 3.3.8).
- The same help and policy links on every page (Consistent Help, 3.2.6).
- Respect for the device's reduced-motion setting.

**Appearance:** light and dark themes, following the device by default, with a *Match device / Light / Dark* switch in the footer. The switch works without JavaScript; the choice is stored in a cookie and applied on the server, so pages never flash the wrong theme. Dark mode mirrors each Tailwind colour scale through CSS variables (`src/app/globals.css`), so new components get it for free.

**Testing:** `tests/e2e/a11y.spec.ts` scans every page type with axe-core against WCAG 2.0, 2.1 and 2.2 at A and AA, in both themes. It covers the signed-out pages, every client page and every staff page. Any violation fails the build, and so does a contrast check axe can't resolve. `keyboard.spec.ts` checks the skip link, focus visibility, raising a ticket with the keyboard only, the theme switch and the survey radios. Automated tools catch roughly a third to a half of accessibility issues, so a manual screen-reader review, or an external audit, is still recommended before launch.

The accessibility statement is at `/accessibility`. Update its dates whenever you re-test.

## Privacy and data protection (UK GDPR)

- **Privacy notice** at `/privacy`. It lists Vercel, the database host, SendGrid and Anthropic as processors, and covers AI processing, international transfers, retention and rights. Set `LEGAL_NAME` to your registered company name, and **have it reviewed** before launch: it's a sound draft, not legal advice.
- **Audit log** (**Audit log**, admins): records who changed ticket status, priority, type, assignee and copied-in colleagues; client settings, SLA targets and contract dates; invitations, roles and deactivations; data exports and erasures; articles and saved replies; AI draft approvals; and retention deletions. It stores field values and identifiers, never message text.
- **Export** (person's page → *Download data export*): a JSON file of everything held about a person, for subject access requests. Internal staff notes aren't included automatically; review them before responding.
- **Erase** (person's page → *Erase personal data*, confirmed by typing their email): replaces their name and email, signs them out, removes their sign-in links and copied-in entries, and clears their survey comments. Their tickets and replies stay as part of the client's record.
- **Retention:** set each client's **contract end date**. Two years later, the client appears under **Retention**, and on the dashboard, for an admin to review. Typing the client's name confirms permanent deletion of its tickets, files, people, products and articles. Nothing is deleted automatically.

## Client features

- **Service targets:** clients see "we aim to respond within …" on each ticket, and the full table on the new-ticket form, but not internal countdowns.
- **Satisfaction survey:** the "resolved" email has Good / Okay / Poor links to a page where the person confirms and can add a comment. Visiting the link alone records nothing, because email scanners follow links. The link is signed, so it works without signing in, and the same form appears on resolved tickets. Results are on the dashboard.
- **Copy in colleagues:** the requester, their colleagues or staff can copy in other people from the same client organisation, either when raising the ticket or later. Copied-in people get the same emails and can reply by email.
- **Saved replies** (staff, under **Saved replies**): templates inserted into any reply or AI draft at the cursor. Placeholders `{{requester_first_name}}`, `{{client_name}}`, `{{ticket_number}}` and `{{agent_name}}` are filled in automatically.

## Client admins

On a client's settings page, s6a admins use **Make admin** to give named people the client admin role. Client admins get two extra pages:

- **Team:** invite colleagues and deactivate or reactivate them. Invitations are limited to the client's email domains, and client admins can't deactivate themselves or make other admins. Ask s6a for that.
- **Reports:** for the last 30 days, 90 days or 12 months:
  - tickets raised, resolved and open
  - median first response and resolution times, and the share within target
  - the satisfaction rating
  - all of the above broken down by product, with a **CSV download** of the tickets. Cells that start with `=`, `+`, `-` or `@` get a leading apostrophe, so a ticket subject can't run as a spreadsheet formula.

Changes and downloads are recorded in the audit log.

## Service notices

Any staff member can post an **incident** or **planned maintenance** notice under **Notices**. A notice can cover several products and record start and expected end times in UK time.

- Clients whose products are affected see a banner on every page, with a link to the notice's own page. Ongoing incidents show straight away; maintenance shows from 7 days before it starts.
- Publishing, updating and resolving each optionally email every active person at the affected clients.
- On a ticket, staff can link it to an active notice for that product as a duplicate report. The client then sees "Part of a known issue" with a link.

## Sessions and rate limiting

- **Idle sign-out:** staff are signed out after 8 hours without activity, and clients after 7 days. A session's `lastSeenAt` is checked and updated on each request, in `src/lib/idle-session.ts`. A dialog warns 5 minutes ahead and offers **Stay signed in**, as WCAG 2.2.1 requires. Change the limits with `STAFF_IDLE_MINUTES` and `CLIENT_IDLE_MINUTES`.
- **Rate limits** (`src/lib/rate-limit.ts`): fixed-window counters held in Postgres, so they work across serverless instances without Redis. The limits are:
  - 5 sign-in links per email address per 15 minutes, enforced in the login action and again when the email is sent, so posting directly to the Auth.js endpoint is covered too
  - 30 sign-in attempts per IP address per 15 minutes
  - 30 inbound emails per sender per hour
  - 10 survey submissions per link per hour

  Old counters are pruned by the scheduled job.

## Single sign-on

Each client organisation's settings page (**Clients → organisation**) sets:

- which sign-in methods its people may use;
- whether anyone at its email domains can join automatically, or only invited users;
- the tenant or domain its SSO must come from.

On the login page people enter their email first and then see only the methods their organisation allows.

SSO accounts are linked to invited users by email address, so the identity provider must be trusted to assert that address:

### Microsoft Entra ID
Register one **multi-tenant** app in your own tenant ("Accounts in any organizational directory"), with the redirect URI `https://support.s6a.io/api/auth/callback/microsoft-entra-id`. Set `AUTH_MICROSOFT_ENTRA_ID_ID` and `AUTH_MICROSOFT_ENTRA_ID_SECRET`.

For each client, enter their **Entra tenant ID**. Microsoft sign-in is refused without it, because the Entra `email` claim isn't verified by Microsoft. Set `STAFF_ENTRA_TENANT_ID` to your own tenant so staff can use Microsoft too. A client's Entra admin may need to grant consent to the app for their tenant.

### Google Workspace
Create an OAuth client (type: Web) with the redirect URI `https://support.s6a.io/api/auth/callback/google`, then set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. Only verified Google emails are accepted. Optionally pin each client to its Workspace domain (the `hd` claim). `STAFF_GOOGLE_HOSTED_DOMAIN` does the same for staff.

### Generic OIDC (Okta, Auth0, Keycloak, …) and SAML
Add an entry to `OIDC_PROVIDERS` (a JSON array) for each client IdP:

```json
[{"key":"acme-okta","name":"Acme Okta","issuer":"https://acme.okta.com","clientId":"…","clientSecret":"…"}]
```

The redirect URI is `https://support.s6a.io/api/auth/callback/oidc-<key>`. Then choose that provider on the client's settings page. A user can only sign in through their own organisation's provider.

For **SAML-only** identity providers, run a SAML-to-OIDC bridge such as [BoxyHQ SAML Jackson](https://boxyhq.com/docs/jackson/overview) and register the bridge as an OIDC provider above.

## Project layout

```
prisma/schema.prisma          data model
prisma/seed.ts                first admin + demo data
src/lib/auth.ts               Auth.js config (providers, sign-in policy hook)
src/lib/login-policy.ts       pure sign-in rules (unit tested)
src/lib/access.ts             who can see which tickets/products/articles
src/lib/tickets.ts            comment + status transitions
src/lib/sla/                  business-hours arithmetic, SLA clocks, per-client targets
src/lib/ai/                   Claude triage: prompt, structured output, applying results
src/lib/attachments.ts        upload limits and saving; src/lib/storage.ts (Vercel Blob)
src/lib/notifications.ts      who gets emailed and when
src/lib/email/                SendGrid sender, templates, reply tokens, reply parsing
src/app/login/                email-first login page
src/app/(portal)/tickets/     ticket list, new ticket, ticket detail, server actions
src/app/(portal)/kb/          knowledge base
src/app/(portal)/dashboard/   staff dashboard
src/app/(portal)/team/        client admin: people;  src/app/(portal)/reports/  figures + CSV
src/app/(portal)/notices/     notice detail;  src/app/(portal)/admin/notices/  publish/update/resolve
src/app/(portal)/admin/       clients (SLA targets, AI opt-out, contract end), staff, people,
                              articles, saved replies, audit log, retention
src/app/(public)/             privacy notice, accessibility statement, satisfaction survey
src/lib/audit.ts              audit log; src/lib/privacy.ts export/erase; src/lib/retention.ts
src/app/api/email/inbound/    SendGrid Inbound Parse webhook
src/app/api/attachments/      access-checked file downloads
src/app/api/cron/sla/         SLA breach alerts and AI retries
tests/                        vitest unit tests
tests/e2e/                    Playwright: axe-core WCAG scans (light + dark), keyboard and feature tests
```

## Not yet built

Natural next steps:

- Direct-to-Blob browser uploads, to lift the 4 MB web attachment limit.
- An evaluation set for the AI triage prompt, built from real tickets, before tuning it.
- Rate limiting on the login and webhook endpoints.
- A manual screen-reader review (NVDA and VoiceOver), or an external accessibility audit.
- Slack or Teams alerts for urgent tickets.
