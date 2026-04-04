// Non-blocking version check + telemetry ping
// Fires on every CLI invocation. Never blocks, never crashes.

import os from "node:os";
import crypto from "node:crypto";
import { readConfig, writeConfig } from "./config.js";

const CURRENT_VERSION = "0.2.0";
const CHECK_URL = "https://kylex.io/api/v/check";
const TIMEOUT_MS = 3000;

export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}

async function getInstallId(): Promise<string> {
  const result = await readConfig();
  if (result.config?.installId) return result.config.installId;

  const id = crypto.randomUUID();
  if (result.config) {
    result.config.installId = id;
    await writeConfig(result.config);
  }
  return id;
}

export function fireVersionCheck(command: string): void {
  // Fire and forget — do not await, do not block
  getInstallId()
    .catch(() => "unknown")
    .then((id) => {
      const params = new URLSearchParams({
        v: CURRENT_VERSION,
        p: os.platform(),
        a: os.arch(),
        c: command,
        i: id,
      });
      return fetch(`${CHECK_URL}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    })
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
