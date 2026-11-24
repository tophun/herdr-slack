// 슬랙 테마: 슬랙의 '테마' 설정처럼 색 네 가지와 창 그라데이션.
//   nav       시스템 탐색 — 창 바탕(위 띠·레일·사이드바 뒤)
//   selected  선택된 항목 — 사이드바에서 지금 채널의 강조, 그라데이션의 끝색
//   presence  현재 상태   — 내 아바타의 접속 점
//   notify    알림        — 빨간 숫자 뱃지 자리
//   gradient  창 그라데이션 — 창 바탕을 nav 에서 selected 로 섞는다(끄면 nav 한 색)
// shared "slack.theme" 에 { preset, nav, selected, presence, notify, gradient } 로 둔다.
import { shared, setShared, exec, appHome, notify } from "herdr";
import * as fs from "fs/promises";

const THEME_KEY = "slack.theme";

export const PRESETS = [
  { id: "crimson", name: "크림슨 미드나잇", nav: "#9C0000", selected: "#070C52", presence: "#000261", notify: "#026B5A", gradient: true },
  { id: "aubergine", name: "오버진", nav: "#3F0E40", selected: "#1164A3", presence: "#2BAC76", notify: "#CD2553", gradient: false },
  { id: "jade", name: "제이드", nav: "#0B4F3F", selected: "#108A6F", presence: "#2BAC76", notify: "#E8912D", gradient: true },
  { id: "lagoon", name: "라군", nav: "#1B3A57", selected: "#2C7BB6", presence: "#2BAC76", notify: "#E01E5A", gradient: true },
  { id: "barbra", name: "바바라", nav: "#5B0E2D", selected: "#A11B4E", presence: "#2BAC76", notify: "#F2C744", gradient: true },
  { id: "indigo", name: "무드 인디고", nav: "#1F1B4D", selected: "#4F46E5", presence: "#2BAC76", notify: "#E01E5A", gradient: true },
  { id: "graphite", name: "그래파이트", nav: "#1A1D21", selected: "#4A5059", presence: "#2BAC76", notify: "#E01E5A", gradient: false },
];

export const isHex = (v) => /^#?[0-9a-f]{6}$/i.test(String(v ?? "").trim());
export const normHex = (v) => `#${String(v).trim().replace(/^#/, "").toUpperCase()}`;

export function slackTheme() {
  return { ...PRESETS[0], ...(shared(THEME_KEY) ?? {}) };
}

export function setSlackTheme(patch) {
  setShared(THEME_KEY, { ...slackTheme(), ...patch });
}

// 창 바탕을 테마대로: 그라데이션이면 그림을 만들어(색마다 파일 하나) 깔고, 아니면 nav 한 색.
// 레이아웃 파일(layouts/slack.json)의 바탕만 고쳐 쓴다. Herdr 는 파일이 바뀌면 바로 다시 그린다.
// (모드 안에서 보낸 layout.set 은 바탕을 바꾸지 못했다.)
export async function applyBackground(theme = slackTheme()) {
  let background = theme.nav;
  if (theme.gradient) {
    const name = `backgrounds/slack-${theme.nav.slice(1)}-${theme.selected.slice(1)}.png`.toLowerCase();
    const out = `${appHome()}/${name}`;
    const r = await exec("sh", ["-c", `mkdir -p "$(dirname "$1")" && { [ -f "$1" ] || python3 -I "$2" "$1" "$3" "$4"; }`,
      "sh", out, `${appHome()}/mods/slack/gradient.py`, theme.nav, theme.selected]).catch(() => null);
    if (r && r.code === 0) background = { image: name, fit: "cover" };
  }
  const file = `${appHome()}/layouts/slack.json`;
  try {
    const tree = JSON.parse(await fs.readFile(file, "utf8"));
    if (JSON.stringify(tree.background) === JSON.stringify(background)) return;
    tree.background = background;
    await fs.writeFile(file, `${JSON.stringify(tree, null, 2)}\n`);
  } catch (error) {
    notify({ title: "테마 바탕을 바꾸지 못했어요", body: String(error?.message ?? error), level: "error" });
  }
}

// macOS 색 고르기 창. 고르면 "#RRGGBB", 취소하면 null.
export async function pickColor(current) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(current.slice(i, i + 2), 16) * 257);
  const res = await exec("osascript", ["-e", `choose color default color {${r}, ${g}, ${b}}`]).catch(() => null);
  if (!res || res.code !== 0) return null;
  const parts = res.stdout.trim().split(/\s*,\s*/).map((n) => Math.round(Number(n) / 257));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return `#${parts.map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}
