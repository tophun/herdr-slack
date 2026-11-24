// A per-launch override, not a change to ~/.codex/config.toml. Keep the ID last
// so it has an unambiguous location independent of the human-readable name.
export const CODEX_TITLE_CONFIG = 'tui.terminal_title=["app-name","thread-title","project-name","thread-id"]';

export function codexTitleIdentity(terminal) {
  if (!terminal || terminal.state !== "live" || terminal.report?.app !== "codex") return null;
  if (!["working", "idle", "done", "blocked", "error"].includes(terminal.report?.state ?? terminal.status)) return null;
  const argv = terminal.foreground?.argv;
  if (!Array.isArray(argv) || !/(?:^|[/\\])codex(?:\.exe)?$/.test(argv[0] ?? "")) return null;
  // Only trust titles from a TUI explicitly launched with a supported profile.
  // An arbitrary UUID in a task name or a leftover shell title is not identity.
  let override = null;
  for (let index = 1; index < argv.length; index++) {
    const arg = argv[index];
    const value = ["-c", "--config"].includes(arg) ? argv[++index]
      : arg.startsWith("--config=") ? arg.slice(9) : null;
    if (value?.startsWith("tui.terminal_title=")) override = value;
  }
  if (!override) return null;
  let items;
  try { items = JSON.parse(override.slice(override.indexOf("=") + 1)); } catch { return null; }
  if (!Array.isArray(items) || items.at(-1) !== "thread-id" || !items.every(item => ["app-name", "thread-title", "project-name", "thread-id"].includes(item))) return null;
  const part = terminal.title?.split(" | ").at(-1)?.trim().toLowerCase();
  const full = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
  if (full.test(part ?? "")) return { prefix: part, complete: true };
  // Codex 0.167.1 truncates thread-id to 29 characters plus three dots.
  // Resolve this prefix against all log IDs, and reject collisions.
  const truncated = /^([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{5,11})(?:\.\.\.|…)$/.exec(part ?? "");
  return truncated ? { prefix: truncated[1], complete: false } : null;
}

export function titleMatchesFile(identity, file) {
  const id = /([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\.jsonl$/i.exec(file ?? "")?.[1];
  return Boolean(id && id.toLowerCase().startsWith(identity.prefix));
}

const ACTION_REQUIRED = /^\[[^\]]*\]\s*Action Required$/i;

export function hasActionRequired(terminal) {
  if (!terminal || (terminal.state && terminal.state !== "live")) return false;
  const isCodex =
    Boolean(codexTitleIdentity(terminal)) ||
    terminal?.report?.app === "codex" ||
    terminal?.app === "codex" ||
    terminal?.program?.key === "codex";
  if (!isCodex) return false;
  const first = terminal?.title?.split(" | ")[0]?.trim() ?? "";
  return ACTION_REQUIRED.test(first);
}

const agySessionTitles = new Map();
const AGY_TITLES_KEY = "chat.agyTitles";
const AGY_TITLE_TS_KEY = "chat.agyTitleTs";

function loadJsonStorage(key) {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed;
      }
    }
  } catch {}
  return {};
}

export function loadAgyTitles(sharedTitles = null) {
  const stored = loadJsonStorage(AGY_TITLES_KEY);
  return { ...stored, ...(sharedTitles && typeof sharedTitles === "object" ? sharedTitles : {}) };
}

export function saveAgyTitle(address, title, sharedTitles = null, setSharedFn = null, timestamp = Date.now()) {
  const clean = typeof title === "string" ? title.trim() : "";
  if (!address || !clean) return false;
  const tsMap = loadJsonStorage(AGY_TITLE_TS_KEY);
  const prevTs = Number(tsMap[address] ?? 0);
  if (Number.isFinite(timestamp) && prevTs > 0 && timestamp < prevTs) return false;
  const merged = loadAgyTitles(sharedTitles);
  const changed = merged[address] !== clean || sharedTitles?.[address] !== clean;
  agySessionTitles.set(address, clean);
  if (Number.isFinite(timestamp) && timestamp > prevTs) {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(AGY_TITLE_TS_KEY, JSON.stringify({ ...tsMap, [address]: timestamp }));
      }
    } catch {}
  }
  if (!changed) return false;
  const next = { ...merged, [address]: clean };
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(AGY_TITLES_KEY, JSON.stringify(next));
  } catch {}
  if (typeof setSharedFn === "function") setSharedFn(AGY_TITLES_KEY, next);
  return true;
}

export function parseAgyHistoryRenames(jsonlText) {
  const renames = new Map();
  for (const line of (jsonlText ?? "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try { obj = JSON.parse(trimmed); } catch { continue; }
    if (!obj || typeof obj.display !== "string" || typeof obj.conversationId !== "string") continue;
    if (obj.type && obj.type !== "slash_command") continue;
    const m = /^\/rename\s+(.+)$/i.exec(obj.display.trim());
    if (!m) continue;
    const title = m[1].trim();
    const ts = Number(obj.timestamp) || 0;
    const prev = renames.get(obj.conversationId);
    if (title && (!prev || ts >= prev.timestamp)) {
      renames.set(obj.conversationId, { title, timestamp: ts });
    }
  }
  return renames;
}

export function isAgyTerminal(terminal) {
  if (!terminal) return false;
  const app = (terminal.report?.app ?? terminal.app ?? terminal.program?.key ?? "").toLowerCase();
  if (app === "antigravity" || app === "agy") return true;
  const argv0 = terminal.foreground?.argv?.[0] ?? terminal.argv?.[0] ?? "";
  return /(?:^|[/\\])agy(?:\.exe)?$/i.test(argv0);
}

export function conversationTitle(terminal, sharedTitles = null) {
  if (isAgyTerminal(terminal)) {
    const key = terminal?.address ?? null;
    const st = terminal?.report?.state ?? terminal?.status;
    const reported = st === "working" ? terminal?.report?.msg?.trim() : "";
    if (reported) {
      if (key) agySessionTitles.set(key, reported);
      return reported;
    }
    const merged = loadAgyTitles(sharedTitles);
    const cached = (key && merged[key]) || (key && agySessionTitles.get(key)) || "";
    if (cached) return cached;
    const raw = (terminal?.title ?? "").trim();
    if (!raw || /^agy(?:\s|$)/i.test(raw)) return "Antigravity";
    return raw;
  }
  const identity = codexTitleIdentity(terminal);
  if (!identity) {
    const raw = terminal?.title ?? "";
    const parts = raw.split(" | ");
    if (ACTION_REQUIRED.test(parts[0]?.trim() ?? "")) {
      if (parts.length > 1) return parts.slice(1).join(" | ").trim() || "Codex";
      if (terminal?.report?.app === "codex") return "Codex";
    }
    return raw;
  }
  const parts = terminal.title.split(" | ").slice(0, -1);
  if (ACTION_REQUIRED.test(parts[0]?.trim() ?? "")) parts.shift();
  if (parts[0] === "codex") parts.shift();
  // A new, unnamed Codex thread uses its full UUID as its title too.
  if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(parts[0] ?? "")) parts.shift();
  return parts.join(" | ") || "Codex";
}
