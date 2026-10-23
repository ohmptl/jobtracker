import type { Operation } from "./schemas";
export async function tracker(operation: Operation, args: object = {}, signal?: AbortSignal) {
  const response = await fetch("/api/tracker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, args }),
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
