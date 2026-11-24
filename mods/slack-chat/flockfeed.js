// A fast first look at a long conversation, from Flockbook's native sidecar (flockbook-modfeed, MIT,
// github.com/minchenlee/flockbook): it reads the end of the agent's log and answers with summarized rows
// in under 0.1 s. The chat shows those rows until its own parser (parse.js, with thinking, diffs, images
// and question cards) has read the log, then switches to that.
//
// The sidecar is looked for next to this mod (bin/, shipped with the Slack layout), then where Flockbook
// installs it. It runs on this computer only; without it the chat simply waits for its own parser.
import { exec, appHome } from "herdr";
import * as fs from "fs/promises";

const TIMEOUT_MS = 5000;

async function sidecar() {
  for (const path of [`${appHome()}/mods/slack-chat/bin/flockbook-modfeed`, `${appHome()}/flockbook/bin/flockbook-modfeed`]) {
    try { if (await fs.exists(path)) return path; } catch {}
  }
  return null;
}

// Flockbook rows → the chat's entries (the subset its rows carry).
export function rowsToEntries(rows) {
  const entries = [];
  for (const r of rows) {
    const at = Number.isFinite(r.ts) ? r.ts : undefined;
    if (r.k === "user") entries.push({ kind: "user", key: `fb-${r.id}`, text: r.text ?? "", images: [], sentAt: at });
    else if (r.k === "assistant") entries.push({ kind: "assistant", key: `fb-${r.id}`, text: r.text ?? "", sentAt: at });
    else if (r.k === "tools") {
      const items = (r.chips ?? []).flatMap((chip) => chip.calls ?? []).map((call, i) => ({
        id: `fb-${r.id}-${i}`, name: call.name ?? "Tool", summary: call.summary ?? "", input: {},
        result: call.done ? (call.output ?? "") : null, error: Boolean(call.error), images: [],
      }));
      if (items.length) entries.push({ kind: "tools", key: `fb-${r.id}`, items, sentAt: at });
    }
    // footer ("15:11 · 2 tools") and perm (a permission request) wait for the full parse.
  }
  return entries;
}

// The latest rows of the terminal's conversation, as entries; null when the sidecar can't answer.
export async function quickFeed(terminal) {
  const bin = await sidecar();
  if (!bin || !terminal || terminal.includes("/")) return null; // another machine: not from here
  const r = await exec(bin, ["feed", "--terminal", terminal, "--cache", `${appHome()}/data/slack-chat/flockbook-cache.json`,
    "--home", appHome()], { timeout: TIMEOUT_MS }).catch(() => null);
  if (!r || r.code !== 0) return null;
  const rows = [];
  let ok = false;
  for (const line of String(r.stdout ?? "").split("\n")) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.type === "row") rows.push(o);
    else if (o.type === "end") ok = Boolean(o.ok);
  }
  if (!ok || !rows.length) return null;
  return { entries: rowsToEntries(rows) };
}
