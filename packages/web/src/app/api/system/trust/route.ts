import { NextResponse } from "next/server";
import { db } from "@houston/shared";
import { requireAuth } from "@/lib/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;

  const row = await db.systemStatus.findUnique({
    where: { key: "trust_ladder_verification" },
  });

  return NextResponse.json({
    key: "trust_ladder_verification",
    value: row?.value ?? null,
    updatedAt: row?.updatedAt ?? null,
  });
}
