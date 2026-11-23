type WorkBudgetOptions = {
  now?: () => number;
  yieldTask?: () => Promise<void>;
  budgetMs?: number;
};

function yieldToBrowser(): Promise<void> {
  const scheduler = (globalThis as typeof globalThis & {
    scheduler?: { yield?: () => Promise<void> };
  }).scheduler;
  return scheduler?.yield ? scheduler.yield() : new Promise(resolve => setTimeout(resolve, 0));
}

// Pixel preparation checks this at bounded row/frame boundaries. Short pieces
// share one time slice instead of paying a clamped timer for every 32 rows.
// This scheduler belongs only to loading; combat clocks never wait on it.
export function createAssetWorkBudget(signal?: AbortSignal, options: WorkBudgetOptions = {}) {
  const now = options.now ?? (() => performance.now());
  const yieldTask = options.yieldTask ?? yieldToBrowser;
  const budgetMs = options.budgetMs ?? 4;
  let deadline = now() + budgetMs;
  const check = () => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  };
  return async () => {
    check();
    if (now() < deadline) return;
    await yieldTask();
    check();
    deadline = now() + budgetMs;
  };
}
