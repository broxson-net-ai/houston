import { NextRequest, NextResponse } from "next/server";
import {
  getPortfolioSyncControl,
  getPortfolioSyncReport,
  runPortfolioSync,
  setPortfolioSyncControl,
} from "@houston/shared";
import { requireAuth } from "@/lib/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;

  const [control, report] = await Promise.all([
    getPortfolioSyncControl(),
    getPortfolioSyncReport(),
  ]);

  return NextResponse.json({ control, report });
}

export async function PATCH(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const enabled = Boolean(body?.enabled);
  const control = await setPortfolioSyncControl(enabled, "houston-ui");
  const report = await getPortfolioSyncReport();
  return NextResponse.json({ control, report });
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const force = Boolean(body?.force);
  const report = await runPortfolioSync({ updatedBy: "houston-ui", force });
  const control = await getPortfolioSyncControl();
  return NextResponse.json({ control, report });
}
