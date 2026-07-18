type EmptyStateAction = { label: string; href: string };

export default function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: EmptyStateAction;
}) {
  return (
    <section role="status" className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-6 text-center">
      <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-400">{description}</p>
      {action ? (
        <a className="mt-4 inline-flex rounded-lg border border-cyan-300 px-3 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-300/10" href={action.href}>
          {action.label}
        </a>
      ) : null}
    </section>
  );
}
