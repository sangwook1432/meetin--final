"use client";

/**
 * AuthContext
 *
 * 역할:
 *  - 로그인 유저 정보(UserPublic) 전역 관리
 *  - 토큰 저장/삭제
 *  - 앱 시작 시 GET /me로 세션 복구
 *  - login(), logout() 함수 제공
 *
 * 사용 예:
 *   const { user, login, logout, loading } = useAuth()
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  loginApi,
  getMe,
  setTokens,
  clearTokens,
  getToken,
} from "@/lib/api";
import type { UserPublic } from "@/types";

// ─── Context 타입 ─────────────────────────────────────────

interface AuthContextValue {
  user: UserPublic | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>; // 프로필 업데이트 후 재조회용
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState(true);

  // ── 앱 마운트 시 세션 복구 ───────────────────────────────────
  // apiFetch 내부에서:
  //   1. access_token 유효 → 즉시 반환
  //   2. 401 수신 → refresh_token 으로 재발급 1회 시도
  //   3. refresh 실패 → clearTokens() 후 throw "Session expired"
  // 따라서 catch 에서는 setUser(null) 만 해도 충분.
  // (clearTokens 는 api.ts 내부에서 이미 호출됨)
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    getMe()
      .then(setUser)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "";
        // "Session expired" = refresh 실패 → 이미 clearTokens 완료
        // 그 외 네트워크 에러 등은 로그만 남기고 null 처리
        if (msg !== "Session expired") {
          console.warn("[AuthContext] getMe 실패:", msg);
        }
        setUser(null);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const tokens = await loginApi(username, password);
    setTokens(tokens.access_token, tokens.refresh_token);
    const me = await getMe();
    setUser(me);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
    router.push("/login");
  }, [router]);

  const refreshUser = useCallback(async () => {
    try {
      const me = await getMe();
      setUser(me);
    } catch {
      // refresh 실패 시 로그아웃
      clearTokens();
      setUser(null);
      router.push("/login");
    }
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
