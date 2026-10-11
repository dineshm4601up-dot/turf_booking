import { NextResponse } from "next/server";
import { type AdminAuthDeps, adminAuthErrorResponse, checkAdminAuth, defaultAdminAuthDeps } from "@/lib/admin-auth";
import { isValidUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

const QR_BUCKET = "turf-qr-codes";
const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Replaces (upsert) the turf's QR image rather than accumulating files --
 * "allow the admin to upload or replace" means the old file never needs to
 * be separately deleted. The uploaded file and the DB update happen as two
 * steps; if the DB update fails after a successful upload, the file is
 * still safely stored (just not yet linked) and a retry fixes the link.
 */
export async function handleQrUpload(request: Request, turfId: string, deps: AdminAuthDeps = defaultAdminAuthDeps) {
  const authResult = await checkAdminAuth(deps);
  const authError = adminAuthErrorResponse(authResult);
  if (authError) return authError;

  if (!isValidUuid(turfId)) {
    return NextResponse.json({ error: "A valid turf id is required." }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Request must be multipart/form-data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A QR image file is required." }, { status: 400 });
  }
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return NextResponse.json({ error: "QR image must be a PNG, JPEG, or WEBP file." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "QR image must be 2MB or smaller." }, { status: 400 });
  }

  const admin = deps.getAdminClient();

  const { data: turf, error: turfError } = await admin.from("turfs").select("id").eq("id", turfId).maybeSingle();
  if (turfError) {
    console.error("admin/turfs qr upload: fetch failed", turfError);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (!turf) {
    return NextResponse.json({ error: "Turf not found." }, { status: 404 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const path = `${turfId}/qr.${extension}`;

  const { error: uploadError } = await admin.storage
    .from(QR_BUCKET)
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true });

  if (uploadError) {
    console.error("admin/turfs qr upload: storage upload failed", uploadError);
    return NextResponse.json({ error: "Failed to upload the QR image. Please try again." }, { status: 500 });
  }

  const { data: publicUrlData } = admin.storage.from(QR_BUCKET).getPublicUrl(path);
  // Cache-bust so a replaced image shows up immediately instead of a
  // browser-cached copy of the old one at the same URL.
  const qrImageUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { data: updated, error: updateError } = await admin
    .from("turfs")
    .update({ qr_image_url: qrImageUrl })
    .eq("id", turfId)
    .select("id, qr_image_url")
    .single();

  if (updateError) {
    console.error("admin/turfs qr upload: db update failed", updateError);
    return NextResponse.json(
      { error: "The image uploaded but saving it to the turf failed. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ turf: updated }, { status: 200 });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleQrUpload(request, id);
}
