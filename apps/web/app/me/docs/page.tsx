"use client";

/**
 * /me/docs — 재학 인증 (학생증 / 재학증명서 업로드)
 */

import { Suspense, useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { uploadDocFile } from "@/lib/api";
import { AppShell } from "@/components/ui/AppShell";
import type { DocType } from "@/types";
import { T, Icon, MoreNavBar, PrimaryButton, SectionCard } from "@/components/me/MoreAtoms";

const DOC_LABELS: Record<DocType, string> = {
  ENROLLMENT_CERT: "재학증명서",
  STUDENT_ID: "학생증",
};

const DOC_OPTIONS: { id: DocType; label: string; icon: "doc" | "card" }[] = [
  { id: "ENROLLMENT_CERT", label: "재학증명서", icon: "doc" },
  { id: "STUDENT_ID", label: "학생증", icon: "card" },
];

function DocsInner() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isOnboarding = searchParams.get("onboarding") === "1";

  const [docType, setDocType] = useState<DocType>("ENROLLMENT_CERT");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const docPendingKey = user ? `doc_pending_${user.id}` : null;
  const [docSubmitted, setDocSubmitted] = useState(() => {
    if (typeof window === "undefined" || !user) return false;
    return localStorage.getItem(`doc_pending_${user.id}`) === "1";
  });

  useEffect(() => {
    if (!docPendingKey) return;
    if (user?.verification_status === "VERIFIED" || user?.verification_status === "REJECTED") {
      localStorage.removeItem(docPendingKey);
      setDocSubmitted(false);
    }
  }, [user?.verification_status, docPendingKey]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError(null);
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  };

  const handleUpload = async () => {
    setError(null);
    if (!file) {
      setError("파일을 선택해주세요");
      return;
    }
    setUploading(true);
    try {
      await uploadDocFile(docType, file);
      await refreshUser();
      if (docPendingKey) localStorage.setItem(docPendingKey, "1");
      setDocSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  if (!user) return null;

  // ── VERIFIED ─────────────────────────────
  if (user.verification_status === "VERIFIED") {
    if (docPendingKey) localStorage.removeItem(docPendingKey);
    return (
      <AppShell>
        <div style={{ background: T.bg, minHeight: "100%", fontFamily: T.fontSans, paddingBottom: 40 }}>
          <MoreNavBar title="재학 인증" fallbackHref="/me" />
          <div style={{ padding: "24px 16px" }}>
            <SectionCard padding={24} style={{
              textAlign: "center", borderColor: T.success, background: T.successSoft,
            }}>
              <div style={{
                width: 56, height: 56, margin: "0 auto", borderRadius: 999,
                background: T.success, color: "#FFF",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon name="check" size={28} stroke="#FFF" />
              </div>
              <div style={{
                marginTop: 14, fontSize: 18, fontWeight: 800,
                color: T.success, letterSpacing: "-0.02em",
              }}>
                인증 완료!
              </div>
              <div style={{
                marginTop: 6, fontSize: 13, color: T.success, opacity: 0.9, lineHeight: 1.55,
              }}>
                재학 인증이 완료되었어요.
                <br />이제 미팅에 자유롭게 참가할 수 있어요.
              </div>
              <button
                onClick={() => router.push("/discover")}
                style={{
                  marginTop: 18, padding: "12px 20px", borderRadius: T.radiusMd,
                  background: T.success, color: "#FFF", border: 0,
                  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                미팅 둘러보기 →
              </button>
            </SectionCard>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── 검토 중 ─────────────────────────────
  if (docSubmitted && user.verification_status !== "REJECTED") {
    return (
      <AppShell>
        <div style={{ background: T.bg, minHeight: "100%", fontFamily: T.fontSans, paddingBottom: 40 }}>
          <MoreNavBar title="재학 인증" fallbackHref="/me" />
          <div style={{ padding: "24px 16px" }}>
            <SectionCard padding={24} style={{
              textAlign: "center", borderColor: T.warning, background: T.warningSoft,
            }}>
              <div style={{
                width: 56, height: 56, margin: "0 auto", borderRadius: 999,
                background: T.warning, color: "#FFF",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon name="clock" size={28} stroke="#FFF" />
              </div>
              <div style={{
                marginTop: 14, fontSize: 18, fontWeight: 800,
                color: "oklch(0.45 0.13 70)", letterSpacing: "-0.02em",
              }}>
                검토 중
              </div>
              <div style={{
                marginTop: 6, fontSize: 13, color: "oklch(0.50 0.10 70)", lineHeight: 1.55,
              }}>
                서류를 제출했어요.
                <br />보통 24시간 이내 관리자 검토가 완료됩니다.
              </div>
              <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  onClick={() => router.push("/discover")}
                  style={{
                    padding: "12px 20px", borderRadius: T.radiusMd,
                    background: T.warning, color: "#FFF", border: 0,
                    fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {isOnboarding ? "미팅 먼저 둘러보기 →" : "확인"}
                </button>
                <button
                  onClick={() => {
                    if (docPendingKey) localStorage.removeItem(docPendingKey);
                    setDocSubmitted(false);
                    setFile(null);
                    setPreview(null);
                    setError(null);
                  }}
                  style={{
                    padding: "10px 16px", borderRadius: T.radiusMd,
                    background: "transparent",
                    color: "oklch(0.50 0.10 70)",
                    border: `1px solid oklch(0.78 0.10 70)`,
                    fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  잘못 올렸나요? 다시 제출하기
                </button>
              </div>
            </SectionCard>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── 업로드 폼 ──────────────────────────
  return (
    <AppShell>
      <div style={{ background: T.bg, minHeight: "100%", fontFamily: T.fontSans, paddingBottom: 40 }}>
        <MoreNavBar title="재학 인증" fallbackHref="/me" />

        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* 진행 안내 */}
          {isOnboarding && (
            <div style={{
              background: T.accentSoft, border: `1px solid ${T.accent}40`,
              borderRadius: T.radiusLg, padding: "12px 14px",
            }}>
              <div style={{
                fontSize: 12, fontWeight: 800, color: T.accentInk, letterSpacing: "-0.01em",
              }}>
                마지막 단계예요
              </div>
              <div style={{
                marginTop: 3, fontSize: 11, color: T.accentInk, opacity: 0.85, lineHeight: 1.5,
              }}>
                학생증 또는 재학증명서를 업로드하면 미팅 참가가 가능해요.
              </div>
              <div style={{
                marginTop: 8, display: "flex", alignItems: "center", gap: 5,
                fontSize: 10, color: T.accentInk,
              }}>
                <span style={{ opacity: 0.55 }}>✓ 프로필</span>
                <span style={{ opacity: 0.4 }}>→</span>
                <span style={{ fontWeight: 800 }}>재학 인증</span>
                <span style={{ opacity: 0.4 }}>→</span>
                <span style={{ opacity: 0.4 }}>미팅</span>
              </div>
            </div>
          )}

          {user.verification_status === "REJECTED" && (
            <div style={{
              background: "oklch(0.95 0.05 22)",
              border: `1px solid oklch(0.85 0.10 22)`,
              borderRadius: T.radiusMd, padding: "12px 14px",
            }}>
              <div style={{
                fontSize: 12, fontWeight: 800, color: "oklch(0.50 0.18 22)",
              }}>
                인증이 거절되었어요
              </div>
              <div style={{
                marginTop: 2, fontSize: 11, color: "oklch(0.55 0.15 22)", lineHeight: 1.5,
              }}>
                서류를 다시 확인하고 재업로드해주세요.
              </div>
            </div>
          )}

          {/* 서류 유형 */}
          <SectionCard>
            <div style={{
              fontSize: 12, fontWeight: 700, color: T.ink,
              marginBottom: 10, letterSpacing: "-0.01em",
            }}>
              서류 유형
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {DOC_OPTIONS.map((opt) => {
                const active = docType === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDocType(opt.id)}
                    style={{
                      flex: 1, padding: "14px 10px", borderRadius: T.radiusMd,
                      background: active ? T.accentSoft : T.bg,
                      border: `1.5px solid ${active ? T.accent : T.border}`,
                      cursor: "pointer", fontFamily: "inherit",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                    }}
                  >
                    <Icon name={opt.icon} size={20} stroke={active ? T.accentInk : T.ink} />
                    <div style={{
                      fontSize: 12, fontWeight: 700,
                      color: active ? T.accentInk : T.ink, letterSpacing: "-0.01em",
                    }}>
                      {opt.label}
                    </div>
                  </button>
                );
              })}
            </div>
          </SectionCard>

          {/* 업로드 영역 */}
          <SectionCard>
            <div style={{
              fontSize: 12, fontWeight: 700, color: T.ink, letterSpacing: "-0.01em",
            }}>
              {DOC_LABELS[docType]} 파일
            </div>
            <div style={{ marginTop: 2, fontSize: 11, color: T.inkSoft }}>
              JPG · PNG · PDF · 최대 10MB
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                marginTop: 10, padding: preview ? 12 : "28px 16px",
                border: `2px dashed ${file ? T.accent : T.borderStrong}`,
                borderRadius: T.radiusMd,
                background: file ? T.accentSoft : T.bg,
                textAlign: "center", cursor: "pointer",
              }}
            >
              {preview ? (
                <img
                  src={preview}
                  alt="미리보기"
                  style={{
                    maxHeight: 200, maxWidth: "100%", borderRadius: T.radiusSm,
                    margin: "0 auto", display: "block", objectFit: "contain",
                  }}
                />
              ) : (
                <>
                  <div style={{
                    width: 44, height: 44, margin: "0 auto", borderRadius: 999,
                    background: T.surfaceMuted, color: T.ink,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon name="plus" size={22} stroke={T.ink} />
                  </div>
                  <div style={{
                    marginTop: 10, fontSize: 13, fontWeight: 700,
                    color: T.ink, letterSpacing: "-0.01em",
                  }}>
                    {file ? file.name : "탭해서 파일 선택"}
                  </div>
                  {!file && (
                    <div style={{ marginTop: 3, fontSize: 11, color: T.inkSoft }}>
                      또는 여기에 끌어다 놓으세요
                    </div>
                  )}
                </>
              )}
              {file && preview && (
                <div style={{
                  marginTop: 8, fontSize: 12, fontWeight: 600,
                  color: T.accentInk, wordBreak: "break-all",
                }}>
                  {file.name}
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />

            {file && (
              <button
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                style={{
                  marginTop: 8, padding: "6px 0",
                  background: "transparent", border: 0,
                  fontSize: 11, color: T.inkSoft, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                ✕ 파일 제거
              </button>
            )}
          </SectionCard>

          <div style={{
            padding: "12px 14px",
            background: T.surfaceMuted, borderRadius: T.radiusMd,
            fontSize: 11, color: T.inkSoft, lineHeight: 1.7,
          }}>
            <div style={{
              fontWeight: 700, color: T.inkMid, marginBottom: 4, fontSize: 12,
            }}>
              업로드 주의사항
            </div>
            • 이름과 학번이 선명하게 보이는 서류를 올려 주세요<br />
            • 제출하신 정보는 인증 목적으로만 사용되며 안전하게 보관돼요
          </div>

          {error && (
            <div style={{
              padding: "10px 12px", borderRadius: T.radiusMd,
              background: "oklch(0.95 0.05 22)",
              color: "oklch(0.50 0.18 22)",
              fontSize: 12.5, fontWeight: 600,
            }}>
              {error}
            </div>
          )}

          <PrimaryButton onClick={handleUpload} disabled={uploading || !file}>
            {uploading ? "제출 중..." : "제출하기"}
          </PrimaryButton>

          {isOnboarding && (
            <button
              onClick={() => router.push("/discover")}
              style={{
                padding: "10px 0", background: "transparent", border: 0,
                fontSize: 12, color: T.inkSoft, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              나중에 하기
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function DocsPage() {
  return (
    <Suspense fallback={
      <div style={{
        display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center",
        fontSize: 13, color: T.inkSoft,
      }}>
        로딩 중...
      </div>
    }>
      <DocsInner />
    </Suspense>
  );
}
