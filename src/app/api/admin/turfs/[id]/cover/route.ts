import { NextResponse } from "next/server";
import { type AdminAuthDeps, adminAuthErrorResponse, checkAdminAuth, defaultAdminAuthDeps } from "@/lib/admin-auth";
import { isValidUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

const COVER_BUCKET = "turf-cover-images";
const MAX_BYTES = 5 * 1024 * 1024; // 5MB -- a hero photo, not an icon, so a larger cap than the QR upload's 2MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Mirrors the QR-upload route (src/app/api/admin/turfs/[id]/qr/route.ts):
 * same upsert-by-fixed-path replace semantics, same auth gating, same
 * two-step upload-then-link pattern.
 */
export async function handleCoverUpload(request: Request, turfId: string, deps: AdminAuthDeps = defaultAdminAuthDeps) {
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
    return NextResponse.json({ error: "A cover image file is required." }, { status: 400 });
  }
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return NextResponse.json({ error: "Cover image must be a PNG, JPEG, or WEBP file." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Cover image must be 5MB or smaller." }, { status: 400 });
  }

  const admin = deps.getAdminClient();

  const { data: turf, error: turfError } = await admin.from("turfs").select("id").eq("id", turfId).maybeSingle();
  if (turfError) {
    console.error("admin/turfs cover upload: fetch failed", turfError);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (!turf) {
    return NextResponse.json({ error: "Turf not found." }, { status: 404 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const path = `${turfId}/cover.${extension}`;

  const { error: uploadError } = await admin.storage
    .from(COVER_BUCKET)
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true });

  if (uploadError) {
    console.error("admin/turfs cover upload: storage upload failed", uploadError);
    return NextResponse.json({ error: "Failed to upload the cover image. Please try again." }, { status: 500 });
  }

  const { data: publicUrlData } = admin.storage.from(COVER_BUCKET).getPublicUrl(path);
  const coverImageUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { data: updated, error: updateError } = await admin
    .from("turfs")
    .update({ cover_image_url: coverImageUrl })
    .eq("id", turfId)
    .select("id, cover_image_url")
    .single();

  if (updateError) {
    console.error("admin/turfs cover upload: db update failed", updateError);
    return NextResponse.json(
      { error: "The image uploaded but saving it to the turf failed. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ turf: updated }, { status: 200 });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleCoverUpload(request, id);
}
