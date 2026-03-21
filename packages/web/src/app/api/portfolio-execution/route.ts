import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { getPortfolioExecutionBoard } from "@/lib/portfolio-execution";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;

  const board = getPortfolioExecutionBoard();
  if (!board) {
    return NextResponse.json({ error: "Portfolio execution board not found" }, { status: 404 });
  }

  return NextResponse.json({ board });
}
