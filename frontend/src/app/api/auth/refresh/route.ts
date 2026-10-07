import { backendFetch } from "@/lib/server/backend";
import {
  getRefreshCookie,
  setRefreshCookie,
  clearRefreshCookie,
} from "@/lib/server/session";

/** Exchange the first-party refresh cookie for a fresh access token, rotating
 *  the refresh token (backend rotates on every refresh). Used on app boot to
 *  restore an in-memory session, and on 401. */
export async function POST() {
  const rt = await getRefreshCookie();
  if (!rt) {
    // No cookie is the normal state for a logged-out visitor, not an error:
    // 204 keeps every public page's console free of a red 401 on boot.
    return new Response(null, { status: 204 });
  }

  const r = await backendFetch("/api/v1/auth/refresh", {
    method: "POST",
    headers: { cookie: `refresh_token=${encodeURIComponent(rt)}` },
  });

  if (r.status === 200 && r.refreshToken) {
    await setRefreshCookie(r.refreshToken); // rotate
  } else if (r.status === 401) {
    await clearRefreshCookie(); // reuse/expired → drop the dead cookie
  }
  return Response.json(r.body, { status: r.status });
}
