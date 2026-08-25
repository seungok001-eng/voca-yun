"use client";

import { useEffect, useRef } from "react";

// 화면을 최신 상태로 유지한다.
// 선생님이 진도를 바꾸면 학생 화면이 스스로 따라오도록:
//  - 탭으로 돌아오거나 창이 다시 활성화되면 즉시 새로고침
//  - 화면을 보고 있는 동안에는 일정 간격으로 조용히 새로고침
// 화면이 가려져 있으면 아무 요청도 하지 않는다.
export function useLiveRefresh(refresh: () => void, intervalMs = 30000) {
  const saved = useRef(refresh);
  saved.current = refresh;

  useEffect(() => {
    if (typeof document === "undefined") return;
    let timer: number | undefined;

    const run = () => { if (document.visibilityState === "visible") saved.current(); };
    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(run, intervalMs);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") { run(); start(); }
      else window.clearInterval(timer);
    };

    start();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", run);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", run);
    };
  }, [intervalMs]);
}
