// Bound both connection and response-body reading. Racing also protects callers
// when an implementation ignores AbortSignal or completes after the deadline.
export async function saveJsonWithTimeout(url: string, init: RequestInit, timeoutMs = 15_000) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("save_timeout"));
      controller.abort();
    }, timeoutMs);
  });
  const operation = (async () => {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const result = await response.json();
    return { response, result };
  })();
  try { return await Promise.race([operation, deadline]); }
  finally { clearTimeout(timer); }
}
