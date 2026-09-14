import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Log ud. POST frem for GET, så et link-preview ikke kan logge folk ud. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });
}
