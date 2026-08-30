import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy（Next 16 中 middleware 的新名称）：仅做 Cookie 存在性的乐观检查，
 * 不做数据库校验——真正的鉴权在页面级 requirePageUser 与各 API 路由中。
 * Cookie 常量需与 src/lib/auth.ts 的 SESSION_COOKIE 保持一致（此处不可复用
 * server-only 模块）。
 */
const SESSION_COOKIE = "coachat_session";

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (!hasSession && pathname.startsWith("/chat")) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }
  if (hasSession && pathname === "/login") {
    return NextResponse.redirect(new URL("/chat", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/chat/:path*", "/login"],
};
