import {
  CpAutonomyLevel,
  CpDocKind,
  CpDocMode,
  CpPhaseStatus,
  CpProjectStatus,
  CpRiskLevel,
  CpTrustMode,
  CpWorkItemStatus,
  CpWorkItemType,
} from "@houston/shared";
import { NextResponse } from "next/server";

export function isControlPlaneEnabled() {
  return true;
}

export function controlPlaneDisabledResponse() {
  return NextResponse.json(
    { error: "Control plane API is disabled" },
    { status: 404 }
  );
}

export function badRequest(message: string, details?: Record<string, unknown>) {
  return NextResponse.json({ error: message, details }, { status: 400 });
}

export function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function conflict(message: string, details?: Record<string, unknown>) {
  return NextResponse.json({ error: message, details }, { status: 409 });
}

function parseEnumValue<T extends string>(value: unknown, options: readonly T[]): T | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase() as T;
  return options.includes(normalized) ? normalized : null;
}

export function parseProjectStatus(value: unknown) {
  return parseEnumValue(value, Object.values(CpProjectStatus));
}

export function parseTrustMode(value: unknown) {
  return parseEnumValue(value, Object.values(CpTrustMode));
}

export function parseDocMode(value: unknown) {
  return parseEnumValue(value, Object.values(CpDocMode));
}

export function parseDocKind(value: unknown) {
  return parseEnumValue(value, Object.values(CpDocKind));
}

export function parsePhaseStatus(value: unknown) {
  return parseEnumValue(value, Object.values(CpPhaseStatus));
}

export function parseWorkItemType(value: unknown) {
  return parseEnumValue(value, Object.values(CpWorkItemType));
}

export function parseWorkItemStatus(value: unknown) {
  return parseEnumValue(value, Object.values(CpWorkItemStatus));
}

export function parseAutonomyLevel(value: unknown) {
  return parseEnumValue(value, Object.values(CpAutonomyLevel));
}

export function parseRiskLevel(value: unknown) {
  return parseEnumValue(value, Object.values(CpRiskLevel));
}

export function parseOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null;
}

export function parseRequiredString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

export function parseOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseOptionalStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function handleControlPlaneError(error: unknown, fallbackMessage: string) {
  const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
  if (code === "P2025") {
    return notFound("Resource not found");
  }
  if (code === "P2002") {
    return conflict("Unique constraint violated");
  }
  if (code === "VERSION_CONFLICT") {
    return conflict("Version mismatch");
  }
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
