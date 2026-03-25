import { getServerSession } from "next-auth/next";
import { headers } from "next/headers";
import { authOptions } from "./auth";
import { NextResponse } from "next/server";

export async function requireAuth() {
  // Allow requests with a valid static API key (for internal service-to-service calls)
  const apiKey = process.env.HOUSTON_API_KEY;
  if (apiKey) {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    if (authHeader === `Bearer ${apiKey}`) {
      return null;
    }
  }

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function getSession() {
  return getServerSession(authOptions);
}
