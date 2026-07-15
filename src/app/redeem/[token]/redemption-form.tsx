"use client";

import { useState } from "react";
import { submitRedemptionAction } from "./actions";

export default function RedemptionForm({ token, priorCount }: { token: string; priorCount: number | null }) {
  const [message, setMessage] = useState<string>("");
  const [pending, setPending] = useState(false);
  async function submit(formData: FormData) {
    setPending(true);
    setMessage("");
    const result = await submitRedemptionAction(formData);
    setPending(false);
    setMessage(result.ok ? `Saved ${result.report?.count ?? 0} redemptions.` : result.error ?? "Unable to save redemption count.");
  }
  return (
    <form action={submit} className="mx-auto flex max-w-md flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <input type="hidden" name="token" value={token} />
      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
        Redemptions
        <input name="count" type="number" min={0} max={100000} step={1} defaultValue={priorCount ?? 0} required className="rounded-lg border border-slate-300 px-3 py-3 text-lg" />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
        Note (optional)
        <textarea name="note" maxLength={500} rows={3} className="rounded-lg border border-slate-300 px-3 py-3" />
      </label>
      <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50">
        {pending ? "Saving…" : "Save redemption count"}
      </button>
      {message ? <p role="status" className="text-sm text-slate-600">{message}</p> : null}
    </form>
  );
}