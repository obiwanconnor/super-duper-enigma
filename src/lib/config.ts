export const brand = {
  name: "s6a Support Portal",
  shortName: "s6a Support",
};

export function appUrl(path = ""): string {
  const base = (process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}
