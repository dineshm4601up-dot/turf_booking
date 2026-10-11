import { NextResponse } from "next/server";
import { type AdminAuthDeps, adminAuthErrorResponse, checkAdminAuth, defaultAdminAuthDeps } from "@/lib/admin-auth";
import { isValidUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function handleBlockDelete(blockId: string, deps: AdminAuthDeps = defaultAdminAuthDeps) {
  const authResult = await checkAdminAuth(deps);
  const authError = adminAuthErrorResponse(authResult);
  if (authError) return authError;

  if (!isValidUuid(blockId)) {
    return NextResponse.json({ error: "A valid block id is required." }, { status: 400 });
  }

  const admin = deps.getAdminClient();
  const { data, error } = await admin.from("turf_blocks").delete().eq("id", blockId).select("id").maybeSingle();

  if (error) {
    console.error("admin/blocks DELETE failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Block not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleBlockDelete(id);
}
