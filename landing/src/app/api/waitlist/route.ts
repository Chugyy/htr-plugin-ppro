import { NextRequest, NextResponse } from "next/server";
import { addToWaitlist, getWaitlistEntries, getWaitlistCount } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { firstName, lastName, email, source } = body;

    if (!firstName || !lastName || !email) {
      return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email invalide" }, { status: 400 });
    }

    await addToWaitlist(firstName.trim(), lastName.trim(), email.trim().toLowerCase(), source || "unknown");

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";

    // SQLite UNIQUE constraint = email already exists
    if (message.includes("UNIQUE constraint")) {
      return NextResponse.json({ error: "Cet email est déjà inscrit" }, { status: 409 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const key = req.headers.get("x-api-key");

  if (!key || key !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const entries = getWaitlistEntries();
    const count = getWaitlistCount();
    return NextResponse.json({ count, entries });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
