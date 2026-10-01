import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE, THEMES, type Theme } from "@/lib/theme";
import { setTheme } from "@/app/theme-actions";

const labels: Record<Theme, string> = { system: "Match device", light: "Light", dark: "Dark" };

export async function ThemeSwitcher() {
  const current = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <form action={setTheme}>
      <fieldset>
        <legend className="mb-1 font-semibold text-slate-800">Appearance</legend>
        <div className="flex flex-wrap gap-1" role="group">
          {THEMES.map((t) => (
            <button
              key={t}
              type="submit"
              name="theme"
              value={t}
              aria-pressed={current === t}
              className={`min-h-6 rounded-md border px-3 py-1 text-sm ${
                current === t ? "border-brand-600 bg-brand-600 font-semibold text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {labels[t]}
            </button>
          ))}
        </div>
      </fieldset>
    </form>
  );
}
