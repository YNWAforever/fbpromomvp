export default function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string | number | null | undefined;
  description?: string;
}) {
  const displayValue = value === null || value === undefined || value === "" ? "Unavailable" : String(value);

  return (
    <article aria-label={label} className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{displayValue}</p>
      {description ? <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p> : null}
    </article>
  );
}
