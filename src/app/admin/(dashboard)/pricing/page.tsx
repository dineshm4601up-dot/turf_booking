"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Plus, Trash2 } from "lucide-react";
import { CURRENCY_SYMBOL } from "@/config/turf";
import { formatTime12Hour } from "@/lib/time";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];

interface Turf {
  id: string;
  name: string;
}

interface PricingRule {
  id: string;
  turf_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  price_per_hour: number;
  turfs: { name: string } | null;
}

interface FormState {
  turfId: string;
  days: number[];
  startTime: string;
  endTime: string;
  pricePerHour: number;
}

function emptyForm(defaultTurfId: string): FormState {
  return { turfId: defaultTurfId, days: [], startTime: "06:00", endTime: "23:00", pricePerHour: 800 };
}

export default function AdminPricingPage() {
  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [rules, setRules] = useState<PricingRule[]>([]);
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
      const [turfsRes, pricingRes] = await Promise.all([fetch("/api/admin/turfs"), fetch("/api/admin/pricing")]);
      const turfsBody = await turfsRes.json();
      const pricingBody = await pricingRes.json();
      if (!turfsRes.ok) throw new Error(turfsBody.error ?? "Failed to load turfs.");
      if (!pricingRes.ok) throw new Error(pricingBody.error ?? "Failed to load pricing rules.");
      setTurfs(turfsBody.turfs);
      setRules(pricingBody.pricingRules);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pricing data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/admin/turfs"), fetch("/api/admin/pricing")])
      .then(async ([turfsRes, pricingRes]) => {
        const turfsBody = await turfsRes.json();
        const pricingBody = await pricingRes.json();
        if (!turfsRes.ok) throw new Error(turfsBody.error ?? "Failed to load turfs.");
        if (!pricingRes.ok) throw new Error(pricingBody.error ?? "Failed to load pricing rules.");
        if (!cancelled) {
          setTurfs(turfsBody.turfs);
          setRules(pricingBody.pricingRules);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load pricing data.");
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

  function toggleDay(day: number) {
    setForm((f) => ({
      ...f,
      days: f.days.includes(day) ? f.days.filter((d) => d !== day) : [...f.days, day],
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (form.days.length === 0) {
      setFormError("Select at least one day.");
      return;
    }
    setSubmitting(true);
    setFormError(null);

    const errors: string[] = [];
    for (const day of form.days) {
      try {
        const res = await fetch("/api/admin/pricing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            turfId: form.turfId,
            dayOfWeek: day,
            startTime: form.startTime,
            endTime: form.endTime,
            pricePerHour: form.pricePerHour,
          }),
        });
        const body = await res.json();
        if (!res.ok) errors.push(`${DAY_LABELS[day]}: ${body.error}`);
      } catch {
        errors.push(`${DAY_LABELS[day]}: request failed`);
      }
    }

    await loadData();
    setSubmitting(false);
    if (errors.length > 0) {
      setFormError(errors.join(" "));
    } else {
      setFormOpen(false);
    }
  }

  async function handleDelete(rule: PricingRule) {
    const confirmed = window.confirm(
      `Delete the ${DAY_LABELS[rule.day_of_week]} ${formatTime12Hour(rule.start_time)}–${formatTime12Hour(rule.end_time)} rate for ${rule.turfs?.name ?? "this turf"}? This only affects future bookings; past bookings keep their recorded price.`
    );
    if (!confirmed) return;

    setDeletingId(rule.id);
    try {
      const res = await fetch(`/api/admin/pricing/${rule.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to delete pricing rule.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete pricing rule.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Pricing</h1>
          <p className="text-sm text-slate-500">
            Prices by day of week and time range. Editing or deleting a rule never changes the price already
            recorded on past bookings.
          </p>
        </div>
        <button
          type="button"
          onClick={openForm}
          disabled={turfs.length === 0}
          className="min-h-11 flex items-center gap-1.5 rounded-lg bg-turf-600 px-4 text-sm font-semibold text-white hover:bg-turf-700 disabled:opacity-50"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add price rule
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
          <h2 className="text-sm font-semibold text-slate-700">Add price rule</h2>

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

          <div>
            <p className="text-xs font-medium text-slate-600 mb-1">Days</p>
            <div className="flex gap-1.5 mb-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, days: WEEKDAYS }))}
                className="min-h-8 rounded-md border border-slate-300 px-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Weekdays
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, days: WEEKEND }))}
                className="min-h-8 rounded-md border border-slate-300 px-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Weekend
              </button>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {DAY_LABELS.map((label, day) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleDay(day)}
                  aria-pressed={form.days.includes(day)}
                  className={`min-h-9 min-w-9 rounded-md border text-xs font-medium ${
                    form.days.includes(day)
                      ? "border-turf-600 bg-turf-600 text-white"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Price per hour ({CURRENCY_SYMBOL})
              <input
                required
                type="number"
                min={1}
                step={1}
                value={form.pricePerHour}
                onChange={(e) => setForm((f) => ({ ...f, pricePerHour: Number(e.target.value) }))}
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
              {submitting ? "Saving…" : "Save rule(s)"}
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
          Loading pricing rules&hellip;
        </div>
      ) : rules.length === 0 ? (
        <p className="text-sm text-slate-500 bg-slate-100 rounded-lg px-3 py-6 text-center">
          No pricing rules yet. Customers can&apos;t be charged for a time range with no rule.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-3 py-2 font-medium">Turf</th>
                <th className="px-3 py-2 font-medium">Day</th>
                <th className="px-3 py-2 font-medium">Time range</th>
                <th className="px-3 py-2 font-medium">Price / hour</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 text-slate-600">{rule.turfs?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{DAY_LABELS[rule.day_of_week]}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {formatTime12Hour(rule.start_time)} &ndash; {formatTime12Hour(rule.end_time)}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-800">
                    {CURRENCY_SYMBOL}
                    {rule.price_per_hour}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={deletingId === rule.id}
                      onClick={() => handleDelete(rule)}
                      aria-label="Delete pricing rule"
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
