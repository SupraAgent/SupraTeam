import { getWebhookHandler } from "@/lib/bot";

export async function POST(request: Request) {
  const handler = getWebhookHandler();
  if (!handler) {
    return new Response("Bot not configured", { status: 503 });
  }
  return handler(request);
}
