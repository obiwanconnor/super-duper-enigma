import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { enabledProviders } from "@/lib/auth";
import { authMethodLabels } from "@/lib/labels";
import { getOidcProviders } from "@/lib/oidc-providers";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { addProduct, inviteClientUser, setUserActive, updateOrganization } from "../../actions";

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
              <span className="block text-slate-500">Otherwise users must be invited individually.</span>
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
            <p className="mt-1 text-xs text-slate-500">Required for Microsoft sign-in. Only accounts from this tenant are accepted.</p>
          </div>
          <div>
            <label className="label" htmlFor="googleHostedDomain">
              Google Workspace domain
            </label>
            <input id="googleHostedDomain" name="googleHostedDomain" defaultValue={org.googleHostedDomain ?? ""} placeholder="acme.com" className="input" />
            <p className="mt-1 text-xs text-slate-500">Optional. Restricts Google sign-in to this Workspace.</p>
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
          <SubmitButton pendingText="Saving…">Save settings</SubmitButton>
        </form>

        <div className="space-y-8">
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Products</h2>
            <ul className="mb-4 divide-y divide-slate-100 text-sm">
              {org.products.length === 0 && <li className="py-2 text-slate-500">No products yet.</li>}
              {org.products.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    {p.description && <div className="text-slate-500">{p.description}</div>}
                  </div>
                  <div className="text-xs text-slate-500">
                    <Link href={`/tickets?product=${p.id}&view=all`} className="link">
                      {p._count.tickets} {p._count.tickets === 1 ? "ticket" : "tickets"}
                    </Link>{" "}
                    · {p._count.articles} {p._count.articles === 1 ? "article" : "articles"}
                  </div>
                </li>
              ))}
            </ul>
            <form action={addProduct} className="flex flex-wrap gap-2">
              <input type="hidden" name="organizationId" value={org.id} />
              <input name="name" placeholder="Product name" required className="input flex-1" />
              <input name="description" placeholder="Description (optional)" className="input flex-1" />
              <SubmitButton className="btn-secondary">Add</SubmitButton>
            </form>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-semibold">People</h2>
            <ul className="mb-4 divide-y divide-slate-100 text-sm">
              {org.users.length === 0 && <li className="py-2 text-slate-500">No users yet.</li>}
              {org.users.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2 py-2">
                  <div className={u.active ? "" : "text-slate-400 line-through"}>
                    <div className="font-medium">{u.name ?? u.email}</div>
                    {u.name && <div className="text-slate-500">{u.email}</div>}
                  </div>
                  <form action={setUserActive}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="active" value={String(!u.active)} />
                    <input type="hidden" name="returnTo" value={path} />
                    <button className="text-xs link">{u.active ? "Deactivate" : "Reactivate"}</button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={inviteClientUser} className="flex flex-wrap gap-2">
              <input type="hidden" name="organizationId" value={org.id} />
              <input name="email" type="email" placeholder="Email" required className="input flex-1" />
              <input name="name" placeholder="Name (optional)" className="input flex-1" />
              <SubmitButton className="btn-secondary">Invite</SubmitButton>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
