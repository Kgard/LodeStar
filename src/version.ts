// Non-blocking version check + telemetry ping
// Fires on every CLI invocation. Never blocks, never crashes.
// Update notice suppressed for 7 days after last check, unless critical.

import os from "node:os";
import crypto from "node:crypto";
import { readConfig, writeConfig } from "./config.js";

const CURRENT_VERSION = "0.2.0";
const CHECK_URL = "https://www.kylex.io/api/v/check";
const TIMEOUT_MS = 3000;
const NOTIFY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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

async function shouldNotify(): Promise<boolean> {
  const result = await readConfig();
  if (!result.config?.lastUpdateCheck) return true;

  const last = new Date(result.config.lastUpdateCheck).getTime();
  return Date.now() - last > NOTIFY_COOLDOWN_MS;
}

async function markChecked(): Promise<void> {
  const result = await readConfig();
  if (!result.config) return;
  result.config.lastUpdateCheck = new Date().toISOString();
  await writeConfig(result.config);
}

export function fireVersionCheck(command: string): void {
  // Fire and forget — do not await, do not block
  Promise.all([getInstallId().catch(() => "unknown"), shouldNotify().catch(() => true)])
    .then(([id, notify]) => {
      const params = new URLSearchParams({
        v: CURRENT_VERSION,
        p: os.platform(),
        a: os.arch(),
        c: command,
        i: id,
      });
      // Always ping for telemetry, but only show notice if cooldown expired
      return fetch(`${CHECK_URL}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
        .then((res) => {
          if (!res.ok) return;
          return res.json();
        })
        .then((data) => {
          if (!data?.update || !data?.latest) return;

          // Critical flag overrides cooldown
          if (data.critical || notify) {
            const prefix = data.critical ? "⚠ Critical update" : "Update available";
            console.error(`\n  ${prefix}: v${CURRENT_VERSION} → v${data.latest} — run lodestar update\n`);
            markChecked().catch(() => {});
          }
        });
    })
    .catch(() => {
      // Silent — network failure, timeout, or offline. Never block the user.
    });
}
