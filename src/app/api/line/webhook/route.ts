import type { NextRequest } from "next/server";
import { getHandlers } from "@/server/container";

export function POST(request: NextRequest) {
  return getHandlers().webhook(request);
}
