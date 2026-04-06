import { listCpSystemEvents } from "@houston/shared";
import { requireAuth } from "@/lib/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const authError = await requireAuth();
  if (authError) return authError;

  const url = new URL(request.url);
  const streamType = url.searchParams.get("streamType") ?? undefined;
  const initialCursor = url.searchParams.get("cursor") ?? undefined;

  const encoder = new TextEncoder();
  let cursor = initialCursor;

  const stream = new ReadableStream({
    async start(controller) {
      const writeEvents = async () => {
        const events = await listCpSystemEvents({ streamType, cursor, take: 100 });
        for (const event of events) {
          cursor = event.id;
          controller.enqueue(
            encoder.encode(
              `event: ${event.eventName}\ndata: ${JSON.stringify(event)}\n\n`
            )
          );
        }
      };

      await writeEvents();
      const interval = setInterval(() => {
        writeEvents().catch((error) => {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ message: error instanceof Error ? error.message : "stream error" })}\n\n`
            )
          );
        });
      }, 2000);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
