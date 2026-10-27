import type { NextRequest } from "next/server";
import { getHandlers } from "@/server/container";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/contacts/[userId]/messages">) {
  return getHandlers().conversations.listMessages(request, (await params).userId);
}

export async function POST(request: NextRequest, { params }: RouteContext<"/api/contacts/[userId]/messages">) {
  return getHandlers().conversations.sendMessage(request, (await params).userId);
}
