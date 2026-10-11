"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Pencil, Plus, Power, Upload } from "lucide-react";
import { formatTime12Hour } from "@/lib/time";
import { DEFAULT_TURF_WHATSAPP_NUMBER } from "@/lib/admin/turf-validation";

interface Turf {
  id: string;
  name: string;
  location: string;
  sport_type: string;
  opening_time: string;
  closing_time: string;
  slot_interval_minutes: number;
  is_active: boolean;
  upi_vpa: string | null;
  upi_phone: string | null;
  payee_name: string | null;
  qr_image_url: string | null;
  whatsapp_number: string;
  contact_phone: string | null;
}

interface TurfFormState {
  name: string;
  location: string;
  sportType: string;
  openingTime: string;
  closingTime: string;
  slotIntervalMinutes: number;
  upiVpa: string;
  upiPhone: string;
  payeeName: string;
  whatsappNumber: string;
  contactPhone: string;
}

const EMPTY_FORM: TurfFormState = {
  name: "",
  location: "",
  sportType: "",
  openingTime: "06:00",
  closingTime: "23:00",
  slotIntervalMinutes: 30,
  upiVpa: "",
  upiPhone: "",
  payeeName: "",
  whatsappNumber: DEFAULT_TURF_WHATSAPP_NUMBER,
  contactPhone: "",
};

const QR_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const QR_MAX_BYTES = 2 * 1024 * 1024;

type QrUploadState = "idle" | "uploading" | "success" | "error";

export default function AdminTurfsPage() {
  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TurfFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toggleId, setToggleId] = useState<string | null>(null);
  const [editingQrImageUrl, setEditingQrImageUrl] = useState<string | null>(null);
  const [qrUploadState, setQrUploadState] = useState<QrUploadState>("idle");
  const [qrUploadError, setQrUploadError] = useState<string | null>(null);

  async function loadTurfs() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/turfs");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load turfs.");
      setTurfs(body.turfs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load turfs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/turfs")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to load turfs.");
        if (!cancelled) setTurfs(body.turfs);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load turfs.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function openCreateForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditingQrImageUrl(null);
    setQrUploadState("idle");
    setQrUploadError(null);
    setFormOpen(true);
  }

  function openEditForm(turf: Turf) {
    setEditingId(turf.id);
    setForm({
      name: turf.name,
      location: turf.location,
      sportType: turf.sport_type,
      openingTime: turf.opening_time,
      closingTime: turf.closing_time,
      slotIntervalMinutes: turf.slot_interval_minutes,
      upiVpa: turf.upi_vpa ?? "",
      upiPhone: turf.upi_phone ?? "",
      payeeName: turf.payee_name ?? "",
      whatsappNumber: turf.whatsapp_number,
      contactPhone: turf.contact_phone ?? "",
    });
    setFormError(null);
    setEditingQrImageUrl(turf.qr_image_url);
    setQrUploadState("idle");
    setQrUploadError(null);
    setFormOpen(true);
  }

  async function handleQrFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !editingId) return;

    if (!QR_ALLOWED_TYPES.includes(file.type)) {
      setQrUploadState("error");
      setQrUploadError("QR image must be a PNG, JPEG, or WEBP file.");
      return;
    }
    if (file.size > QR_MAX_BYTES) {
      setQrUploadState("error");
      setQrUploadError("QR image must be 2MB or smaller.");
      return;
    }

    setQrUploadState("uploading");
    setQrUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/admin/turfs/${editingId}/qr`, { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to upload QR image.");
      setEditingQrImageUrl(body.turf.qr_image_url);
      setQrUploadState("success");
      await loadTurfs();
    } catch (err) {
      setQrUploadState("error");
      setQrUploadError(err instanceof Error ? err.message : "Failed to upload QR image.");
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const url = editingId ? `/api/admin/turfs/${editingId}` : "/api/admin/turfs";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save turf.");
      setFormOpen(false);
      await loadTurfs();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save turf.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(turf: Turf) {
    setToggleId(turf.id);
    try {
      const res = await fetch(`/api/admin/turfs/${turf.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !turf.is_active }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update turf.");
      await loadTurfs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update turf.");
    } finally {
      setToggleId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Turfs</h1>
          <p className="text-sm text-slate-500">Manage turf details, hours, and availability.</p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="min-h-11 flex items-center gap-1.5 rounded-lg bg-turf-600 px-4 text-sm font-semibold text-white hover:bg-turf-700"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add turf
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
          <h2 className="text-sm font-semibold text-slate-700">{editingId ? "Edit turf" : "Add turf"}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Name
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Location
              <input
                required
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Sport type
              <input
                required
                value={form.sportType}
                onChange={(e) => setForm((f) => ({ ...f, sportType: e.target.value }))}
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Slot interval (minutes)
              <input
                required
                type="number"
                min={5}
                max={240}
                step={5}
                value={form.slotIntervalMinutes}
                onChange={(e) => setForm((f) => ({ ...f, slotIntervalMinutes: Number(e.target.value) }))}
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Opening time
              <input
                required
                type="time"
                value={form.openingTime}
                onChange={(e) => setForm((f) => ({ ...f, openingTime: e.target.value }))}
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Closing time
              <input
                required
                type="time"
                value={form.closingTime}
                onChange={(e) => setForm((f) => ({ ...f, closingTime: e.target.value }))}
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
              />
            </label>
          </div>

          <h3 className="text-sm font-semibold text-slate-700 pt-2 border-t border-slate-100">
            Payment &amp; contact details
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              UPI ID (VPA)
              <input
                value={form.upiVpa}
                onChange={(e) => setForm((f) => ({ ...f, upiVpa: e.target.value }))}
                placeholder="e.g. turfowner@upi"
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Payee name
              <input
                value={form.payeeName}
                onChange={(e) => setForm((f) => ({ ...f, payeeName: e.target.value }))}
                placeholder="Name shown to customers paying via UPI"
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              UPI phone number
              <input
                value={form.upiPhone}
                onChange={(e) => setForm((f) => ({ ...f, upiPhone: e.target.value }))}
                placeholder="Optional"
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Turf owner&apos;s WhatsApp number
              <input
                required
                value={form.whatsappNumber}
                onChange={(e) => setForm((f) => ({ ...f, whatsappNumber: e.target.value }))}
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
              Public contact number (shown as the call icon to customers)
              <input
                value={form.contactPhone}
                onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                placeholder="Optional -- the call icon is hidden if this is blank"
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
              />
            </label>
          </div>

          {editingId ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-slate-600">UPI QR code image</p>
              {editingQrImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local asset
                <img
                  src={editingQrImageUrl}
                  alt="Current UPI QR code"
                  className="size-32 rounded-lg border border-slate-200 bg-white object-contain"
                />
              )}
              <label className="flex min-h-11 w-fit items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                <Upload className="size-4" aria-hidden="true" />
                {editingQrImageUrl ? "Replace QR image" : "Upload QR image"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleQrFileChange}
                  className="hidden"
                />
              </label>
              {qrUploadState === "uploading" && (
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  Uploading&hellip;
                </p>
              )}
              {qrUploadState === "success" && (
                <p className="flex items-center gap-1.5 text-xs text-turf-700">
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  QR image updated.
                </p>
              )}
              {qrUploadState === "error" && qrUploadError && (
                <p className="flex items-center gap-1.5 text-xs text-red-600">
                  <AlertCircle className="size-3.5" aria-hidden="true" />
                  {qrUploadError}
                </p>
              )}
              <p className="text-xs text-slate-400">PNG, JPEG, or WEBP, up to 2MB.</p>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Save the turf first, then upload a QR code while editing it.</p>
          )}

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
              {submitting ? "Saving…" : editingId ? "Save changes" : "Create turf"}
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
          Loading turfs&hellip;
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 font-medium">Sport</th>
                <th className="px-3 py-2 font-medium">Hours</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {turfs.map((turf) => (
                <tr key={turf.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-medium text-slate-800">{turf.name}</td>
                  <td className="px-3 py-2 text-slate-600">{turf.location}</td>
                  <td className="px-3 py-2 text-slate-600">{turf.sport_type}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {formatTime12Hour(turf.opening_time)} &ndash; {formatTime12Hour(turf.closing_time)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        turf.is_active ? "bg-turf-100 text-turf-800" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {turf.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditForm(turf)}
                        aria-label={`Edit ${turf.name}`}
                        className="min-h-8 min-w-8 flex items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={toggleId === turf.id}
                        onClick={() => handleToggleActive(turf)}
                        aria-label={turf.is_active ? `Deactivate ${turf.name}` : `Activate ${turf.name}`}
                        className="min-h-8 flex items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <Power className="size-3.5" aria-hidden="true" />
                        {turf.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
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
