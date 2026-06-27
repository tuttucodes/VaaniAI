import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    return fail("Invalid request", 422, error.flatten());
  }

  if (error instanceof Error && error.message === "Unauthorized") {
    return fail("Unauthorized", 401);
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  return fail(message, 500);
}
