// Reads a question an agent asks on its terminal screen (a trust or
// permission prompt): the question's text and its choices, if it has any.

const MARKER = /^(\s*)([❯›>])\s+/;
const NUMBER = /^\s*\d+[.)]\s+/;
const HINT = /(enter\s+(?:to\s+)?(?:confirm|select|continue|submit)|esc\s+(?:to\s+)?(?:cancel|exit|back)|↑\/↓|to navigate)/i;
const RULE = /^\s*[─━—\-▔▁═]{8,}\s*$/;

// A menu waiting at the bottom of the screen: its hint line ("Enter to confirm ·
// Esc to cancel") is among the last lines. "form" when ←/→ change its values,
// which a pick-one list can't show.
export function menuAtBottom(screen) {
  let lines = (screen ?? "").split("\n").filter((l) => l.trim());
  // Claude keeps its input box (a rule, ❯, a rule, its footer) under the menu.
  const rules = lines.flatMap((l, i) => (RULE.test(l) ? [i] : []));
  const box = rules.at(-2);
  if (box !== undefined && lines.length - box <= 6 && /^\s*[❯>]/.test(lines[box + 1] ?? "")) lines = lines.slice(0, box);
  const hint = lines.slice(-2).find((l) => HINT.test(l));
  return hint ? (/←|→|to change/.test(hint) ? "form" : "menu") : null;
}

const CHECKBOX = /^(?:\[([ xX✓✔])\]|(☐|☑))\s+/;
const PROMPT_HEADER = /^\s*(?:Would you like to\b|Do you want to\b|Allow\s+\S+.*\?|Approaching rate limits\b|Rate limit reached\b)/i;
const TRANSCRIPT_LINE = /^\s*(?:[›❯•●⏺]\s+|Worked for\s+\d)/i;
const TABLE_OR_RULE = /[─━—]{4,}|[┌┬┐├┼┤└┴┘│]/;
const FIELD_OR_CMD = /^(?:(?:Environment|Reason|Command|Directory|Working directory|Path|File|Host|Tool):\s|\$\s)/i;

// { question, options: [text], selected, multi?, checked?, boxes? } or null when the screen has no menu.
export function parsePrompt(screen) {
  // A ✔ marks the current choice; read it as an indent, so its line lines up.
  const current = new Set();
  const lines = (screen ?? "").split("\n").map((l, i) => {
    const m = /^(\s*(?:[❯›>]\s+)?)[✔✓]\s/.exec(l);
    if (!m) return l;
    current.add(i);
    return m[1] + "  " + l.slice(m[0].length);
  });
  const at = lines.findLastIndex((l) => MARKER.test(l) && !HINT.test(l));
  if (at < 0) return null;
  // Unselected options sit where the marker's text starts; deeper lines continue one.
  const indent = MARKER.exec(lines[at])[0].length;
  const depth = (l) => l.length - l.trimStart().length;
  const isOption = (l) => MARKER.test(l) || (l.trim() && depth(l) === indent && !HINT.test(l) && !RULE.test(l));
  const continues = (l) => l.trim() && depth(l) > indent && !HINT.test(l) && !RULE.test(l);

  let first = at;
  while (first > 0 && (isOption(lines[first - 1]) || continues(lines[first - 1]))) first--;
  while (first < at && !isOption(lines[first])) first++;
  let last = at;
  while (last + 1 < lines.length && (isOption(lines[last + 1]) || continues(lines[last + 1]))) last++;
  const options = [];
  const checked = [];
  const boxes = [];
  let hasCheckbox = false;
  let selected = 0;
  for (let i = first; i <= last; i++) {
    const l = lines[i];
    let text = l.replace(MARKER, "").replace(NUMBER, "").trim();
    if (!isOption(l)) { options[options.length - 1] += " " + text; continue; }
    if (i === at) selected = options.length;
    const box = CHECKBOX.exec(text);
    if (box) {
      hasCheckbox = true;
      boxes.push(true);
      checked.push(box[2] === "☑" || /[xX✓✔]/.test(box[1] ?? ""));
      text = text.slice(box[0].length).trim();
    } else {
      boxes.push(false);
      checked.push(false);
    }
    options.push(current.has(i) ? `${text} ✓` : text);
  }
  if (options.length < 2) return null;

  // The question: what's above the options, back to the last rule line or transcript boundary.
  let top = first;
  while (top > 0 && !RULE.test(lines[top - 1])) top--;
  for (let i = top; i < first; i++) {
    if (PROMPT_HEADER.test(lines[i])) { top = i; break; }
    if (TRANSCRIPT_LINE.test(lines[i]) || TABLE_OR_RULE.test(lines[i])) {
      while (i + 1 < first && lines[i + 1].trim() && !PROMPT_HEADER.test(lines[i + 1])) i++;
      top = i + 1;
    }
  }
  const question = reflow(lines.slice(top, first));
  return hasCheckbox
    ? { question, options, selected, multi: true, checked, boxes }
    : { question, options, selected };
}

// Terminal-wrapped text as paragraphs.
export function reflow(lines) {
  const out = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) { out.push(""); continue; }
    if (FIELD_OR_CMD.test(l) && out.length && out.at(-1) !== "") out.push("");
    out.push(l);
  }
  return out.join("\n").replace(/\n{2,}/g, "\u0000").replace(/\n/g, " ")
    .split("\u0000").map((p) => p.trim()).filter(Boolean).join("\n\n");
}

// The keys that move the selection from `from` to `to` and confirm it.
export function choose(from, to) {
  const keys = Array(Math.abs(to - from)).fill(to > from ? "down" : "up");
  return [...keys, "enter"];
}

// The keys that move the selection from `from` to `to` and toggle a checkbox.
export function toggleChoice(from, to) {
  const keys = Array(Math.abs(to - from)).fill(to > from ? "down" : "up");
  return [...keys, "space"];
}
