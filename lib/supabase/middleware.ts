import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getEnv, isDemoMode } from "@/lib/env";

const protectedPagePrefixes = ["/dashboard"];
type CookieToSet = {
  name: string;
  value: string;
  options: Parameters<NextResponse["cookies"]["set"]>[2];
};

export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    if (isDemoMode()) return response;
    if (protectedPagePrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix))) {
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const isProtected = protectedPagePrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix));
  if (!user && isProtected) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && request.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}
