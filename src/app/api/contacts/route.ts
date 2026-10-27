import type { NextRequest } from "next/server";
import { getHandlers } from "@/server/container";

export function GET(request: NextRequest) {
  return getHandlers().conversations.listContacts(request);
}
