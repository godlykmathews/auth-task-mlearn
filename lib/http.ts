import { NextResponse } from "next/server";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const configured = process.env.APP_URL;
  // In production, use an explicit trusted origin, never a client-supplied Host header.
  if (process.env.NODE_ENV === "production" && !configured) throw new Error("APP_URL is required in production.");
  const expected = new URL(configured || request.url).origin;
  if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new HttpError(403, "This request could not be verified. Refresh the page and try again.");
  }
}

export async function readJson(request: Request): Promise<unknown> {
  requireSameOrigin(request);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new HttpError(415, "Send the form as JSON.");
  }
  const maxBytes = 8192;
  if (Number(request.headers.get("content-length")) > maxBytes) throw new HttpError(413, "Form data is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "The form data could not be read.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, "Form data is too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError(400, "The form data could not be read."); }
}

export function handleError(error: unknown) {
  if (error instanceof HttpError) {
    const response = json({ error: error.message }, error.status);
    if (error.status === 429) response.headers.set("Retry-After", "900");
    return response;
  }
  // Do not log request bodies, passwords, tokens, or database connection details.
  console.error("Authentication operation failed", error instanceof Error ? error.name : "UnknownError");
  return json({ error: "Something went wrong. Please try again shortly." }, 500);
}
