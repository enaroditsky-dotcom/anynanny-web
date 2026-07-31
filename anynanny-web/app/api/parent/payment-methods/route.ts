import { createServerClient } from "@/lib/supabase/server";
import {
  deleteParentPaymentMethod,
  listParentPaymentMethods,
  setDefaultParentPaymentMethod
} from "@/lib/wallet/parent-payment-methods";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireParent() {
  const supabase = await createServerClient();
  if (!supabase) return { error: NextResponse.json({ error: "Server misconfigured." }, { status: 500 }) };
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  return { supabase, user };
}

export async function GET() {
  const auth = await requireParent();
  if ("error" in auth && auth.error) return auth.error;
  const { supabase, user } = auth as Awaited<ReturnType<typeof requireParent>> & {
    supabase: NonNullable<Awaited<ReturnType<typeof createServerClient>>>;
    user: { id: string };
  };

  const result = await listParentPaymentMethods(supabase, user.id);
  if (result.missingSchema) {
    return NextResponse.json({
      methods: [],
      missingSchema: true,
      error:
        "טבלת אמצעי התשלום עדיין לא הוגדרה ב-Supabase. הריצו את המיגרציה parent_payment_methods."
    });
  }
  if (result.error) {
    return NextResponse.json({ error: result.error, methods: [] }, { status: 400 });
  }
  return NextResponse.json({ methods: result.methods, missingSchema: false });
}

export async function PATCH(request: Request) {
  const auth = await requireParent();
  if ("error" in auth && auth.error) return auth.error;
  const { supabase, user } = auth as Awaited<ReturnType<typeof requireParent>> & {
    supabase: NonNullable<Awaited<ReturnType<typeof createServerClient>>>;
    user: { id: string };
  };

  let body: { methodId?: string; makeDefault?: boolean };
  try {
    body = (await request.json()) as { methodId?: string; makeDefault?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const methodId = String(body.methodId ?? "").trim();
  if (!methodId) {
    return NextResponse.json({ error: "methodId is required." }, { status: 400 });
  }

  if (body.makeDefault) {
    const { error } = await setDefaultParentPaymentMethod(supabase, user.id, methodId);
    if (error) return NextResponse.json({ error }, { status: 400 });
  }

  const listed = await listParentPaymentMethods(supabase, user.id);
  return NextResponse.json({ methods: listed.methods });
}

export async function DELETE(request: Request) {
  const auth = await requireParent();
  if ("error" in auth && auth.error) return auth.error;
  const { supabase, user } = auth as Awaited<ReturnType<typeof requireParent>> & {
    supabase: NonNullable<Awaited<ReturnType<typeof createServerClient>>>;
    user: { id: string };
  };

  const url = new URL(request.url);
  const methodId = String(url.searchParams.get("methodId") ?? "").trim();
  if (!methodId) {
    return NextResponse.json({ error: "methodId is required." }, { status: 400 });
  }

  const { error } = await deleteParentPaymentMethod(supabase, user.id, methodId);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const listed = await listParentPaymentMethods(supabase, user.id);
  return NextResponse.json({ methods: listed.methods });
}
