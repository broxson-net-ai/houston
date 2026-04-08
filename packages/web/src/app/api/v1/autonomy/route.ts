import { NextRequest, NextResponse } from "next/server";
import { getCpSystemSetting, setCpAutonomyPaused } from "@houston/shared";
import { requireAuth } from "@/lib/session";
import {
  controlPlaneDisabledResponse,
  handleControlPlaneError,
  isControlPlaneEnabled,
} from "@/lib/control-plane";

export async function GET() {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const setting = await getCpSystemSetting();
    return NextResponse.json({
      data: {
        autonomyPaused: Boolean(setting.autonomyPaused),
        autonomyPausedReason: setting.autonomyPausedReason ?? null,
        autonomyPausedAt: setting.autonomyPausedAt ?? null,
      },
    });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to load autonomy setting");
  }
}

export async function POST(req: NextRequest) {
  if (!isControlPlaneEnabled()) return controlPlaneDisabledResponse();
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));
    const paused = Boolean(body.paused);
    const reason = typeof body.reason === "string" ? body.reason.trim() : null;
    const setting = await setCpAutonomyPaused({ paused, reason, actor: "operator" });
    return NextResponse.json({
      data: {
        autonomyPaused: Boolean(setting.autonomyPaused),
        autonomyPausedReason: setting.autonomyPausedReason ?? null,
        autonomyPausedAt: setting.autonomyPausedAt ?? null,
      },
    });
  } catch (error) {
    return handleControlPlaneError(error, "Failed to update autonomy setting");
  }
}
