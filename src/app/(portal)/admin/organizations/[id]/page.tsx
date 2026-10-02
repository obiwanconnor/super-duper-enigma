import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { enabledProviders } from "@/lib/auth";
import { authMethodLabels } from "@/lib/labels";
import { getOidcProviders } from "@/lib/oidc-providers";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { addProduct, inviteClientUser, setOrgAdmin, setUserActive, updateOrganization, updateSlaTargets } from "../../actions";
import { aiConfigured } from "@/lib/ai/assistant";
import { PRIORITIES, targetsFor } from "@/lib/sla/sla";
import { priorityLabels } from "@/lib/labels";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const org = await db.organization.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: org ? `${org.name} – client settings` : "Client" };
}

export default async function OrganizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const flash = await searchParams;

  const org = await db.organization.findUnique({
    where: { id },
    include: {
      products: { orderBy: { name: "asc" }, include: { _count: { select: { tickets: true, articles: true } } } },
      users: { orderBy: [{ active: "desc" }, { email: "asc" }] },
      slaTargets: true,
    },
  });
  if (!org) notFound();

  const enabled = enabledProviders();
  const oidcProviders = getOidcProviders();
  const methodAvailable = {
    MAGIC_LINK: enabled.magicLink,
    MICROSOFT: enabled.microsoft,
    GOOGLE: enabled.google,
    OIDC: oidcProviders.length > 0,
  } as const;
  const path = `/admin/organizations/${org.id}`;

  return (
    <div>
      <Link href="/admin/organizations" className="text-sm link">
        ← Clients
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">{org.name}</h1>
      <Flash {...flash} />

      <div className="grid gap-8 lg:grid-cols-2">
        <form action={updateOrganization} className="card space-y-4 p-5">
          <input type="hidden" name="id" value={org.id} />
          <h2 className="font-semibold">Settings</h2>
          <div>
            <label className="label" htmlFor="name">
              Name
            </label>
            <input id="name" name="name" defaultValue={org.name} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="emailDomains">
              Email domains
            </label>
            <input id="emailDomains" name="emailDomains" defaultValue={org.emailDomains.join(", ")} className="input" />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="autoJoin" defaultChecked={org.autoJoin} className="mt-1" />
            <span>
              Anyone with an email address at these domains can sign in
              <span className="block text-slate-600">Otherwise users must be invited individually.</span>
            </span>
          </label>

          <fieldset>
            <legend className="label">Sign-in methods</legend>
            <div className="space-y-1">
              {(Object.keys(authMethodLabels) as (keyof typeof authMethodLabels)[]).map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="authMethods" value={m} defaultChecked={org.authMethods.includes(m)} />
                  {authMethodLabels[m]}
                  {!methodAvailable[m] && <span className="text-xs text-amber-700">(not configured in this deployment)</span>}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label className="label" htmlFor="entraTenantId">
              Microsoft Entra tenant ID
            </label>
            <input id="entraTenantId" name="entraTenantId" defaultValue={org.entraTenantId ?? ""} placeholder="00000000-0000-0000-0000-000000000000" className="input font-mono" />
            <p className="mt-1 text-xs text-slate-600">Required for Microsoft sign-in. Only accounts from this tenant are accepted.</p>
          </div>
          <div>
            <label className="label" htmlFor="googleHostedDomain">
              Google Workspace domain
            </label>
            <input id="googleHostedDomain" name="googleHostedDomain" defaultValue={org.googleHostedDomain ?? ""} placeholder="acme.com" className="input" />
            <p className="mt-1 text-xs text-slate-600">Optional. Restricts Google sign-in to this Workspace.</p>
          </div>
          <div>
            <label className="label" htmlFor="oidcProviderKey">
              OIDC / SAML provider
            </label>
            <select id="oidcProviderKey" name="oidcProviderKey" defaultValue={org.oidcProviderKey ?? ""} className="input">
              <option value="">None</option>
              {oidcProviders.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name} ({p.key})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="contractEndsAt">
              Contract end date
            </label>
            <input
              id="contractEndsAt"
              name="contractEndsAt"
              type="date"
              defaultValue={org.contractEndsAt ? org.contractEndsAt.toISOString().slice(0, 10) : ""}
              className="input"
              aria-describedby="contractEndsAt-hint"
            />
            <p id="contractEndsAt-hint" className="mt-1 text-xs text-slate-600">
              Leave blank while the contract is active. Data becomes due for deletion 2 years after this date.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="aiEnabled" defaultChecked={org.aiEnabled} className="mt-1" />
            <span>
              Use AI first-line triage for this client
              <span className="block text-slate-600">
                Ticket text, conversation and screenshots are sent to Claude (Anthropic) to classify tickets, ask clarifying questions and draft replies.
                {!aiConfigured() && " AI is not configured in this deployment (ANTHROPIC_API_KEY)."}
              </span>
            </span>
          </label>
          <SubmitButton pendingText="Saving…">Save settings</SubmitButton>
        </form>

        <div className="space-y-8">
          <section className="card p-5">
            <h2 className="mb-1 font-semibold">SLA targets</h2>
            <p className="mb-3 text-xs text-slate-600">
              In business hours (Mon–Fri 09:00–17:00 UK, excluding bank holidays; 1 day = 8 hours). The resolution clock pauses while a ticket is waiting on the client.
            </p>
            <form action={updateSlaTargets}>
              <input type="hidden" name="organizationId" value={org.id} />
              <table className="mb-3 w-full text-sm">
                <thead className="text-left text-xs text-slate-600">
                  <tr>
                    <th scope="col" className="pb-2 font-medium">Priority</th>
                    <th scope="col" className="pb-2 font-medium">First response (h)</th>
                    <th scope="col" className="pb-2 font-medium">Resolution (h)</th>
                  </tr>
                </thead>
                <tbody>
                  {PRIORITIES.map((p) => {
                    const t = targetsFor(p, org.slaTargets);
                    return (
                      <tr key={p}>
                        <td className="py-1 pr-2">{priorityLabels[p]}</td>
                        <td className="py-1 pr-2">
                          <input name={`${p}.firstResponse`} type="number" step="0.25" min="0.25" required defaultValue={t.firstResponseMinutes / 60} className="input py-1" aria-label={`${priorityLabels[p]} first response hours`} />
                        </td>
                        <td className="py-1">
                          <input name={`${p}.resolution`} type="number" step="0.25" min="0.25" required defaultValue={t.resolutionMinutes / 60} className="input py-1" aria-label={`${priorityLabels[p]} resolution hours`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <SubmitButton className="btn-secondary" pendingText="Saving…">
                Save targets
              </SubmitButton>
              {org.slaTargets.length === 0 && <span className="ml-3 text-xs text-slate-600">Showing the standard defaults.</span>}
            </form>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Products</h2>
            <ul className="mb-4 divide-y divide-slate-100 text-sm">
              {org.products.length === 0 && <li className="py-2 text-slate-600">No products yet.</li>}
              {org.products.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    {p.description && <div className="text-slate-600">{p.description}</div>}
                  </div>
                  <div className="text-xs text-slate-600">
                    <Link href={`/tickets?product=${p.id}&view=all`} className="link">
                      {p._count.tickets} {p._count.tickets === 1 ? "ticket" : "tickets"}
                    </Link>{" "}
                    · {p._count.articles} {p._count.articles === 1 ? "article" : "articles"}
                  </div>
                </li>
              ))}
            </ul>
            <form action={addProduct} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="organizationId" value={org.id} />
              <div className="min-w-40 flex-1">
                <label htmlFor="product-name" className="label">
                  Product name
                </label>
                <input id="product-name" name="name" required className="input" />
              </div>
              <div className="min-w-40 flex-1">
                <label htmlFor="product-description" className="label">
                  Description (optional)
                </label>
                <input id="product-description" name="description" className="input" />
              </div>
              <SubmitButton className="btn-secondary">Add product</SubmitButton>
            </form>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-semibold">People</h2>
            <ul className="mb-4 divide-y divide-slate-100 text-sm">
              {org.users.length === 0 && <li className="py-2 text-slate-600">No users yet.</li>}
              {org.users.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/admin/users/${u.id}`} className="font-medium link">
                      {u.name ?? u.email}
                    </Link>
                    {u.orgAdmin && <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700">Client admin</span>}
                    {!u.active && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">Inactive</span>}
                    {u.name && <div className="text-slate-600">{u.email}</div>}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                  <form action={setOrgAdmin}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="orgAdmin" value={String(!u.orgAdmin)} />
                    <input type="hidden" name="returnTo" value={path} />
                    <button className="btn-link" aria-label={`${u.orgAdmin ? "Remove client admin from" : "Make client admin:"} ${u.name ?? u.email}`}>
                      {u.orgAdmin ? "Remove admin" : "Make admin"}
                    </button>
                  </form>
                  <form action={setUserActive}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="active" value={String(!u.active)} />
                    <input type="hidden" name="returnTo" value={path} />
                    <button className="btn-link" aria-label={`${u.active ? "Deactivate" : "Reactivate"} ${u.name ?? u.email}`}>
                      {u.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </form>
                  </div>
                </li>
              ))}
            </ul>
            <form action={inviteClientUser} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="organizationId" value={org.id} />
              <div className="min-w-40 flex-1">
                <label htmlFor="invite-email" className="label">
                  Email
                </label>
                <input id="invite-email" name="email" type="email" required autoComplete="off" className="input" />
              </div>
              <div className="min-w-40 flex-1">
                <label htmlFor="invite-name" className="label">
                  Name (optional)
                </label>
                <input id="invite-name" name="name" autoComplete="off" className="input" />
              </div>
              <SubmitButton className="btn-secondary">Invite</SubmitButton>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
