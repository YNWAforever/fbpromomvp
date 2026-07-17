import StatusBadge from "./status-badge";

export type DashboardAction = (formData: FormData) => void | Promise<void>;

export type OperationRow = {
  id: string;
  state: string;
  reason?: string;
  onRetry?: DashboardAction;
  onCancel?: DashboardAction;
};

function ActionButton({ label, action, rowId }: { label: string; action?: DashboardAction; rowId: string }) {
  if (!action) {
    return <button className="rounded-md border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-200" type="button">{label}</button>;
  }

  return (
    <form action={action}>
      <input type="hidden" name="promotionId" value={rowId} />
      <button className="rounded-md border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-200" type="submit">{label}</button>
    </form>
  );
}

export default function OperationsTable({ rows }: { rows: OperationRow[] }) {
  if (!rows.length) {
    return <p className="rounded-xl border border-dashed border-slate-700 p-6 text-sm text-slate-400" role="status">No operations</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
        <caption className="sr-only">Promotion operations</caption>
        <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3 font-medium" scope="col">Promotion</th>
            <th className="px-4 py-3 font-medium" scope="col">Status</th>
            <th className="px-4 py-3 font-medium" scope="col">Reason</th>
            <th className="px-4 py-3 font-medium" scope="col"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 bg-slate-950/40">
          {rows.map((row) => (
            <tr key={row.id}>
              <th className="whitespace-nowrap px-4 py-4 font-medium text-slate-100" scope="row">{row.id}</th>
              <td className="px-4 py-4"><StatusBadge status={row.state} reason={row.reason} /></td>
              <td className="px-4 py-4 text-slate-400">{row.reason ?? "Unavailable"}</td>
              <td className="px-4 py-4">
                <div className="flex flex-wrap gap-2">
                  {row.state === "send_failed" ? <ActionButton label="Retry promotion" action={row.onRetry} rowId={row.id} /> : null}
                  {row.state === "queued" || row.state === "send_failed" ? <ActionButton label="Cancel promotion" action={row.onCancel} rowId={row.id} /> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
