const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

interface StreamCallbacks {
  onToken: (text: string) => void;
  onMeta: (event: string, data: Record<string, unknown>) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export async function streamChat(
  path: string,
  body: object,
  callbacks: StreamCallbacks
): Promise<void> {
  const { onToken, onMeta, onDone, onError } = callbacks;

  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("thesisarc_token") : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      onError((err as { detail?: string }).detail ?? `Error ${response.status}`);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError("No response body");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events: split by double newline
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? ""; // keep incomplete chunk

      for (const part of parts) {
        if (!part.trim()) continue;

        let eventType = "message";
        let dataStr = "";

        for (const line of part.split("\n")) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            dataStr = line.slice(6);
          }
        }

        if (!dataStr) continue;

        try {
          const data = JSON.parse(dataStr);

          switch (eventType) {
            case "token":
              onToken(data.content ?? "");
              break;
            case "suggestion":
            case "action":
            case "evaluation":
              onMeta(eventType, data);
              break;
            case "done":
              onDone();
              break;
            case "error":
              onError(data.message ?? "Unknown error");
              break;
            default:
              break;
          }
        } catch {
          // skip unparseable data
        }
      }
    }

    // In case stream ended without a done event
    onDone();
  } catch (err) {
    onError(err instanceof Error ? err.message : "Network error");
  }
}
