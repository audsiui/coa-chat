"use client";

import { useEffect } from "react";

/** 根级错误兜底：layout 本身崩溃时接管整个文档（必须自带 html/body） */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="zh-CN" className="dark">
      <body
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          background: "#313338",
          color: "#dbdee1",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>应用发生严重错误</h2>
        <p style={{ fontSize: 14, color: "#949ba4" }}>请刷新页面重试</p>
        <button
          onClick={retry}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            background: "#5865f2",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
        >
          重试
        </button>
      </body>
    </html>
  );
}
