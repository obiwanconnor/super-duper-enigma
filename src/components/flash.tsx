export function Flash({ error, notice }: { error?: string; notice?: string }) {
  if (error) return <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (notice) return <p role="status" className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>;
  return null;
}
