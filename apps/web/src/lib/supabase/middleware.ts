// File: src/lib/supabase/middleware.ts
// Purpose: Supabase session refresh + tenant resolution for Next.js middleware
// Depends on: @supabase/ssr, next/server

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith('/auth/');
  // Customer review flow is unauthenticated: /{tenantSlug}/review
  const isReviewRoute = /^\/[^/]+\/review\/?$/.test(pathname);
  const isPublic = pathname === '/' || isAuthRoute || isReviewRoute;

  // Redirect unauthenticated users from protected routes
  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // Redirect authenticated users away from auth pages
  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // TODO: Add tenant resolution logic here
  // Extract tenant slug from subdomain or path

  return supabaseResponse;
}
