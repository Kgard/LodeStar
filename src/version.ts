// Non-blocking version check + telemetry ping
// Fires on every CLI invocation. Never blocks, never crashes.

import os from "node:os";

const CURRENT_VERSION = "0.2.0";
const CHECK_URL = "https://kylex.io/api/v/check";
const TIMEOUT_MS = 3000;

export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}

export function fireVersionCheck(command: string): void {
  // Fire and forget — do not await, do not block
  const params = new URLSearchParams({
    v: CURRENT_VERSION,
    p: os.platform(),
    a: os.arch(),
    c: command,
  });

  const url = `${CHECK_URL}?${params}`;

  fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    .then((res) => {
      if (!res.ok) return;
      return res.json();
    })
    .then((data) => {
      if (data?.update && data?.latest) {
        console.error(`\n  Update available: v${CURRENT_VERSION} → v${data.latest} — run lodestar update\n`);
      }
    })
    .catch(() => {
      // Silent — network failure, timeout, or offline. Never block the user.
    });
}
