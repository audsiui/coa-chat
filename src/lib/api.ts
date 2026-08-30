import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

/** 统一错误：路由里 throw 即可，由 toErrorResponse 兜底 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function toErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    const message = error.issues[0]?.message ?? "参数不合法";
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message } },
      { status: 400 },
    );
  }
  console.error("[api] 未处理异常:", error);
  return NextResponse.json(
    { ok: false, error: { code: "INTERNAL", message: "服务器内部错误" } },
    { status: 500 },
  );
}

/** 解析 JSON body 并用 zod 校验，失败抛 ApiError/ZodError */
export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "BAD_JSON", "请求体不是合法 JSON");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError(400, "VALIDATION_ERROR", result.error.issues[0]?.message ?? "参数不合法");
  }
  return result.data;
}

export function paramsOf<T extends Record<string, string>>(
  params: Promise<T> | T,
): Promise<T> {
  return Promise.resolve(params);
}
