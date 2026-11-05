import type { NextRequest } from "next/server";
import { objectDownloadResponse } from "@/lib/object-download-response";
import { getObject } from "@/lib/vws-api/client";

export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  return objectDownloadResponse(await params, request.nextUrl.searchParams, getObject);
}
