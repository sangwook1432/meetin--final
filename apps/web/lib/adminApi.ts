/**
 * 관리자 API 클라이언트
 * api.ts의 apiFetch와 동일한 로직이나 독립적으로 export
 * (admin 페이지에서 직접 사용)
 */

import { getToken, setTokens, clearTokens } from "@/lib/api";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

let _refreshing: Promise<boolean> | null = null;

async function _tryRefresh(): Promise<boolean> {
  if (_refreshing) return _refreshing;
  _refreshing = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return false;
      const data = await res.json();
      setTokens(data.access_token);
      return true;
    } catch {
      return false;
    } finally {
      _refreshing = null;
    }
  })();
  return _refreshing;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  _retry = true,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401 && _retry) {
    const ok = await _tryRefresh();
    if (ok) return apiFetch<T>(path, options, false);
    clearTokens();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `HTTP ${res.status}`);
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

// ─── 매칭권 무상 지급 ─────────────────────────────────────────────

export interface TicketGrantUserInfo {
  id: number;
  nickname: string | null;
  username: string | null;
  university: string | null;
  matching_tickets: number;
  phone_last4: string;
}

export async function adminSearchUserByPhone(phone: string): Promise<TicketGrantUserInfo> {
  return apiFetch(`/admin/users/search-by-phone?phone=${encodeURIComponent(phone)}`);
}

export async function adminGrantTickets(
  userId: number,
  amount: number,
  note: string,
): Promise<{ user_id: number; nickname: string | null; matching_tickets: number; granted: number }> {
  return apiFetch("/admin/tickets/grant", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, amount, note }),
  });
}
