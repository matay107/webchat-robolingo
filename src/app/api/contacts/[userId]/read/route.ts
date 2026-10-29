import type { NextRequest } from "next/server";
import { getHandlers } from "@/server/container";

export async function POST(request: NextRequest, { params }: RouteContext<"/api/contacts/[userId]/read">) {
  return getHandlers().conversations.markRead(request, (await params).userId);
}
