import { redirect } from "next/navigation";

/**
 * 루트 "/" 경로 접근 시 /discover로 리다이렉트
 * 로그인 여부는 /discover 내부에서 처리 (로그인 안 됐으면 /login으로)
 */
export default function Home() {
  redirect("/discover");
}
