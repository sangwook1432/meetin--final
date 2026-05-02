"use client";

/**
 * /vacancies → /discover 리다이렉트 (둘러보기/빈자리 통합됨)
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function VacanciesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/discover");
  }, [router]);
  return null;
}
