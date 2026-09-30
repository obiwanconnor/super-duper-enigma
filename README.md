# s6a Support Portal

A support portal for the software built by s6a. Client stakeholders raise and follow tickets and read help articles for their products. s6a staff triage, assign and answer tickets in the same app.

- **Ticketing**: tickets per product with type, priority, status and assignee. Replies are Markdown. Staff can add internal notes that clients never see. A client reply reopens resolved tickets automatically.
- **Knowledge base**: Markdown articles per product. Only signed-in people at that product's client organisation can read them.
- **Sign-in chosen per client**: each organisation picks its methods from an emailed sign-in link, Microsoft Entra ID, Google Workspace, or its own OIDC provider (SAML through an OIDC bridge).
- **Email via SendGrid**: notifications for new tickets, replies and status changes. Replying to a notification email adds a comment to the ticket.

Stack: Next.js 16 (App Router, server actions), TypeScript, Auth.js v5, Prisma 6, PostgreSQL, Tailwind CSS 4. It is built to run on Vercel.

## Roles and structure

| Role | Who | Can |
|---|---|---|
| `CLIENT` | Stakeholder at a client | See all tickets for their organisation, raise and reply to tickets, mark them resolved or reopen them, read their products' articles |
| `AGENT` | s6a support staff | Everything across all clients: assign, change status and priority, add internal notes, write articles |
| `ADMIN` | s6a admin | As agent, plus manage client organisations, products, client users and staff |

An organisation has users and one or more **products**. Every ticket and article belongs to a product.

## Local development

```bash
cp .env.example .env          # set DATABASE_URL and AUTH_SECRET (npx auth secret)
npm install
npm run db:migrate            # create the schema
SEED_ADMIN_EMAIL=you@s6a.example SEED_DEMO=1 npm run db:seed
npm run dev
```

Sign in at http://localhost:3000 with your admin email. When `SENDGRID_API_KEY` is empty, emails, including sign-in links, are **printed to the server console**. The demo data includes a client user, `jane@acme.example`.

Run `npm test` for unit tests and `npm run typecheck` for types.

## Deploying to Vercel

1. Create a Postgres database (Neon, Supabase or Vercel Marketplace Postgres) and set `DATABASE_URL`.
2. Import the repo into Vercel. The `vercel-build` script runs `prisma migrate deploy` before `next build`.
3. Set the environment variables from `.env.example`. At minimum set `DATABASE_URL`, `AUTH_SECRET`, `APP_URL`, `SENDGRID_API_KEY`, `EMAIL_FROM`, `REPLY_DOMAIN` and `INBOUND_EMAIL_SECRET`.
4. Create the first admin once, against the production database: `SEED_ADMIN_EMAIL=you@s6a.example npm run db:seed`.

## SendGrid

**Sending:** create an API key with *Mail Send* permission. Authenticate your sending domain and set `EMAIL_FROM` to an address on it.

**Reply by email:** every notification carries a personal `Reply-To` address of the form `ticket+<number>.<userId>.<signature>@REPLY_DOMAIN`. The signature is an HMAC over the ticket and the recipient, keyed on `AUTH_SECRET`. A reply is accepted only when the signature is valid, the sender matches the recipient it was issued to, and that person can still see the ticket. Quoted history is stripped.

1. Choose a subdomain for replies, such as `reply.support.s6a.example`, and point its MX record at `mx.sendgrid.net`.
2. In SendGrid, go to **Settings → Inbound Parse** and add that host with this destination URL:
   `https://<your-app>/api/email/inbound?secret=<INBOUND_EMAIL_SECRET>`
   Leave "POST the raw, full MIME message" unticked.
3. Set `REPLY_DOMAIN` to the same subdomain.

> Changing `AUTH_SECRET` invalidates the reply addresses in emails already sent.

## Single sign-on

Each client organisation's settings page (**Clients → organisation**) sets:

- which sign-in methods its people may use;
- whether anyone at its email domains can join automatically, or only invited users;
- the tenant or domain its SSO must come from.

On the login page people enter their email first and then see only the methods their organisation allows.

SSO accounts are linked to invited users by email address, so the identity provider must be trusted to assert that address:

### Microsoft Entra ID
Register one **multi-tenant** app in your own tenant ("Accounts in any organizational directory"), with the redirect URI `https://<your-app>/api/auth/callback/microsoft-entra-id`. Set `AUTH_MICROSOFT_ENTRA_ID_ID` and `AUTH_MICROSOFT_ENTRA_ID_SECRET`.

For each client, enter their **Entra tenant ID**. Microsoft sign-in is refused without it, because the Entra `email` claim isn't verified by Microsoft. Set `STAFF_ENTRA_TENANT_ID` to your own tenant so staff can use Microsoft too. A client's Entra admin may need to grant consent to the app for their tenant.

### Google Workspace
Create an OAuth client (type: Web) with the redirect URI `https://<your-app>/api/auth/callback/google`, then set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. Only verified Google emails are accepted. Optionally pin each client to its Workspace domain (the `hd` claim). `STAFF_GOOGLE_HOSTED_DOMAIN` does the same for staff.

### Generic OIDC (Okta, Auth0, Keycloak, …) and SAML
Add an entry to `OIDC_PROVIDERS` (a JSON array) for each client IdP:

```json
[{"key":"acme-okta","name":"Acme Okta","issuer":"https://acme.okta.com","clientId":"…","clientSecret":"…"}]
```

The redirect URI is `https://<your-app>/api/auth/callback/oidc-<key>`. Then choose that provider on the client's settings page. A user can only sign in through their own organisation's provider.

For **SAML-only** identity providers, run a SAML-to-OIDC bridge such as [BoxyHQ SAML Jackson](https://boxyhq.com/docs/jackson/overview) and register the bridge as an OIDC provider above.

## Project layout

```
prisma/schema.prisma          data model
prisma/seed.ts                first admin + demo data
src/lib/auth.ts               Auth.js config (providers, sign-in policy hook)
src/lib/login-policy.ts       pure sign-in rules (unit tested)
src/lib/access.ts             who can see which tickets/products/articles
src/lib/tickets.ts            comment + status transitions
src/lib/notifications.ts      who gets emailed and when
src/lib/email/                SendGrid sender, templates, reply tokens, reply parsing
src/app/login/                email-first login page
src/app/(portal)/tickets/     ticket list, new ticket, ticket detail, server actions
src/app/(portal)/kb/          knowledge base
src/app/(portal)/admin/       clients, staff, articles
src/app/api/email/inbound/    SendGrid Inbound Parse webhook
tests/                        vitest unit tests
```

## Not in this first version

Natural next steps:

- File attachments, for example through Vercel Blob, including attachments on inbound email.
- SLA targets and breach reporting per client contract.
- A reporting dashboard.
- Rate limiting on the login and webhook endpoints.
- CSAT survey on resolution.
- Slack or Teams alerts for urgent tickets.
