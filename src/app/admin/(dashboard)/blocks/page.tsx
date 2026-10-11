"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Plus, Trash2 } from "lucide-react";
import { formatTime12Hour } from "@/lib/time";

interface Turf {
  id: string;
  name: string;
}

interface Block {
  id: string;
  turf_id: string;
  block_date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  turfs: { name: string } | null;
}

interface FormState {
  turfId: string;
  blockDate: string;
  startTime: string;
  endTime: string;
  reason: string;
}

function emptyForm(defaultTurfId: string): FormState {
  return { turfId: defaultTurfId, blockDate: "", startTime: "06:00", endTime: "07:00", reason: "" };
}

export default function AdminBlocksPage() {
  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(""));
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [turfsRes, blocksRes] = await Promise.all([fetch("/api/admin/turfs"), fetch("/api/admin/blocks")]);
      const turfsBody = await turfsRes.json();
      const blocksBody = await blocksRes.json();
      if (!turfsRes.ok) throw new Error(turfsBody.error ?? "Failed to load turfs.");
      if (!blocksRes.ok) throw new Error(blocksBody.error ?? "Failed to load blocks.");
      setTurfs(turfsBody.turfs);
      setBlocks(blocksBody.blocks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load blocked slots.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/admin/turfs"), fetch("/api/admin/blocks")])
      .then(async ([turfsRes, blocksRes]) => {
        const turfsBody = await turfsRes.json();
        const blocksBody = await blocksRes.json();
        if (!turfsRes.ok) throw new Error(turfsBody.error ?? "Failed to load turfs.");
        if (!blocksRes.ok) throw new Error(blocksBody.error ?? "Failed to load blocks.");
        if (!cancelled) {
          setTurfs(turfsBody.turfs);
          setBlocks(blocksBody.blocks);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load blocked slots.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function openForm() {
    setForm(emptyForm(turfs[0]?.id ?? ""));
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/admin/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turfId: form.turfId,
          blockDate: form.blockDate,
          startTime: form.startTime,
          endTime: form.endTime,
          reason: form.reason || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create block.");
      setFormOpen(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create block.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(block: Block) {
    const confirmed = window.confirm(
      `Remove the block on ${block.block_date} (${formatTime12Hour(block.start_time)}–${formatTime12Hour(block.end_time)})? That time will become bookable again immediately.`
    );
    if (!confirmed) return;

    setDeletingId(block.id);
    try {
      const res = await fetch(`/api/admin/blocks/${block.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to remove block.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove block.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Blocked Slots</h1>
          <p className="text-sm text-slate-500">
            Block time for maintenance or private events. Blocks take effect immediately in customer availability.
          </p>
        </div>
        <button
          type="button"
          onClick={openForm}
          disabled={turfs.length === 0}
          className="min-h-11 flex items-center gap-1.5 rounded-lg bg-turf-600 px-4 text-sm font-semibold text-white hover:bg-turf-700 disabled:opacity-50"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add block
        </button>
      </div>

      {error && (
        <p
          className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
          role="alert"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {formOpen && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-700">Add block</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Turf
              <select
                required
                value={form.turfId}
                onChange={(e) => setForm((f) => ({ ...f, turfId: e.target.value }))}
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
              >
                {turfs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Date
              <input
                required
                type="date"
                value={form.blockDate}
                onChange={(e) => setForm((f) => ({ ...f, blockDate: e.target.value }))}
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Start time
              <input
                required
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              End time
              <input
                required
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
              Reason (optional)
              <input
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Maintenance, private event"
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
              />
            </label>
          </div>

          {formError && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
              {formError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="min-h-11 rounded-lg bg-turf-600 px-4 text-sm font-semibold text-white hover:bg-turf-700 disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Create block"}
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading blocked slots&hellip;
        </div>
      ) : blocks.length === 0 ? (
        <p className="text-sm text-slate-500 bg-slate-100 rounded-lg px-3 py-6 text-center">No blocked slots.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-3 py-2 font-medium">Turf</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Time range</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {blocks.map((block) => (
                <tr key={block.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 text-slate-600">{block.turfs?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{block.block_date}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {formatTime12Hour(block.start_time)} &ndash; {formatTime12Hour(block.end_time)}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{block.reason ?? "—"}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={deletingId === block.id}
                      onClick={() => handleDelete(block)}
                      aria-label="Remove block"
                      className="min-h-8 min-w-8 flex items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
