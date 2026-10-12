import { describe, expect, it } from "vitest";
import { handleCoverUpload } from "../../src/app/api/admin/turfs/[id]/cover/route";
import { makeAdminDeps } from "../helpers/admin-deps";
import type { FakeTables } from "../helpers/fake-supabase";

const TURF_ID = "11111111-1111-4111-8111-111111111111";

function buildTables(): FakeTables {
  return {
    turfs: [{ id: TURF_ID, name: "Test Turf", cover_image_url: null }],
  };
}

function makeFileRequest(file: File | null) {
  const formData = new FormData();
  if (file) formData.append("file", file);
  return new Request("http://localhost", { method: "POST", body: formData });
}

describe("POST /api/admin/turfs/:id/cover", () => {
  it("rejects a non-admin", async () => {
    const tables = buildTables();
    const file = new File([new Uint8Array([1, 2, 3])], "cover.png", { type: "image/png" });
    const res = await handleCoverUpload(makeFileRequest(file), TURF_ID, makeAdminDeps(tables, "non-admin"));
    expect(res.status).toBe(403);
  });

  it("rejects a request with no file", async () => {
    const tables = buildTables();
    const res = await handleCoverUpload(makeFileRequest(null), TURF_ID, makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(400);
  });

  it("rejects a disallowed file type", async () => {
    const tables = buildTables();
    const file = new File([new Uint8Array([1, 2, 3])], "cover.txt", { type: "text/plain" });
    const res = await handleCoverUpload(makeFileRequest(file), TURF_ID, makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(400);
  });

  it("rejects a file over the size limit", async () => {
    const tables = buildTables();
    const bigBytes = new Uint8Array(5 * 1024 * 1024 + 1);
    const file = new File([bigBytes], "cover.png", { type: "image/png" });
    const res = await handleCoverUpload(makeFileRequest(file), TURF_ID, makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(400);
  });

  it("rejects an empty file", async () => {
    const tables = buildTables();
    const file = new File([], "cover.png", { type: "image/png" });
    const res = await handleCoverUpload(makeFileRequest(file), TURF_ID, makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(400);
  });

  it("404s for a turf that doesn't exist", async () => {
    const tables = buildTables();
    const file = new File([new Uint8Array([1, 2, 3])], "cover.png", { type: "image/png" });
    const res = await handleCoverUpload(
      makeFileRequest(file),
      "99999999-9999-4999-8999-999999999999",
      makeAdminDeps(tables, "admin")
    );
    expect(res.status).toBe(404);
  });

  it("uploads a valid PNG and saves the resulting public URL on the turf", async () => {
    const tables = buildTables();
    const file = new File([new Uint8Array([1, 2, 3, 4])], "cover.png", { type: "image/png" });
    const res = await handleCoverUpload(makeFileRequest(file), TURF_ID, makeAdminDeps(tables, "admin"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.turf.cover_image_url).toContain("turf-cover-images");
    expect(tables.turfs![0]!.cover_image_url).toBe(body.turf.cover_image_url);
  });

  it("accepts JPEG and WEBP too", async () => {
    const tables = buildTables();
    const jpeg = new File([new Uint8Array([1, 2, 3])], "cover.jpg", { type: "image/jpeg" });
    const jpegRes = await handleCoverUpload(makeFileRequest(jpeg), TURF_ID, makeAdminDeps(tables, "admin"));
    expect(jpegRes.status).toBe(200);

    const webp = new File([new Uint8Array([1, 2, 3])], "cover.webp", { type: "image/webp" });
    const webpRes = await handleCoverUpload(makeFileRequest(webp), TURF_ID, makeAdminDeps(tables, "admin"));
    expect(webpRes.status).toBe(200);
  });
});
