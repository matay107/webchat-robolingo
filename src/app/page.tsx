import { connection } from "next/server";
import { Inbox } from "@/components/inbox/Inbox";

export default async function InboxPage() {
  // Render per request so the proxy's CSP nonce is applied to the page's scripts.
  await connection();
  return <Inbox />;
}
