import type { NextRequest } from "next/server";
import { getHandlers } from "@/server/container";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/contacts/[userId]/messages/[messageId]/image">) {
  const { userId, messageId } = await params;
  return getHandlers().conversations.getImage(request, userId, messageId);
}
