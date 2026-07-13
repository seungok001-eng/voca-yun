import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "정철 VOCA — 정철어학원 청당국제캠퍼스",
  description:
    "정철어학원 청당국제캠퍼스 공식 단어 학습 앱. 파닉스부터 수능 만점까지 20단계 12,000단어.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "정철 VOCA", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#16204a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen flex flex-col antialiased">{children}</body>
    </html>
  );
}
