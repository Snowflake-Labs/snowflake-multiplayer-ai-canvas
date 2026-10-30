import { NextResponse } from "next/server";
import { getCallerToken, getServiceToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return NextResponse.json({
    ok: true,
    deployed: Boolean(getServiceToken()),
    caller_present: Boolean(getCallerToken(req)),
    node: process.version,
    env: {
      SNOWFLAKE_ACCOUNT: Boolean(process.env.SNOWFLAKE_ACCOUNT),
      SNOWFLAKE_HOST: Boolean(process.env.SNOWFLAKE_HOST),
    },
  });
}
