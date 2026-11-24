// 슬랙 테마: 슬랙의 '테마' 설정처럼 색 네 가지와 창 그라데이션.
//   nav       시스템 탐색 — 창 바탕(위 띠·레일·사이드바 뒤)
//   selected  선택된 항목 — 사이드바에서 지금 채널의 강조, 그라데이션의 끝색
//   presence  현재 상태   — 내 아바타의 접속 점
//   notify    알림        — 빨간 숫자 뱃지 자리
//   gradient  창 그라데이션 — 창 바탕을 nav 에서 selected 로 섞는다(끄면 nav 한 색)
// shared "slack.theme" 에 { preset, nav, selected, presence, notify, gradient } 로 둔다.
import { shared, setShared, exec, appHome, notify, settings, theme as herdrTheme } from "herdr";
import * as fs from "fs/promises";
import { findNode } from "./presentation.js";

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

// 바탕이 밝은 테마인가(시스템이 라이트면 themes/slack-light.json). 바탕색의 밝기로 판단한다.
let lastBg, lastLight;
export function isLight(t) {
  if (t.background === lastBg) return lastLight; // 렌더마다 여러 번 불리니 바탕이 같으면 다시 계산하지 않는다.
  lastBg = t.background;
  const hex = String(t.background ?? "").replace(/^#/, "");
  if (!/^[0-9a-f]{6}/i.test(hex)) return (lastLight = false);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (lastLight = 0.299 * r + 0.587 * g + 0.114 * b > 140);
}

// 라이트 모드의 창 바탕: 테마 색에 흰색을 이만큼 섞는다(프리셋의 느낌만 남긴다).
const LIGHT_MIX = 0.86;
const mixWhite = (hex, k) => `#${[1, 3, 5].map((i) => {
  const c = parseInt(hex.slice(i, i + 2), 16);
  return Math.round(c + (255 - c) * k).toString(16).padStart(2, "0");
}).join("").toUpperCase()}`;

// 창 바탕에 실제로 칠할 두 색. 다크는 테마 색 그대로, 라이트는 밝게 섞은 색.
export function windowColors(theme, light) {
  return light ? { nav: mixWhite(theme.nav, LIGHT_MIX), selected: mixWhite(theme.selected, LIGHT_MIX) }
    : { nav: theme.nav, selected: theme.selected };
}
// 메인 카드 둘레 선: 어두운 바탕엔 흰 반투명, 밝은 바탕엔 검은 반투명.
const cardBorder = (light) => (light ? "#1d1c1d1f" : "#ffffff1f");

export function slackTheme() {
  return { ...PRESETS[0], ...(shared(THEME_KEY) ?? {}) };
}

export function setSlackTheme(patch) {
  setShared(THEME_KEY, { ...slackTheme(), ...patch });
}

// 창 바탕을 테마와 라이트/다크대로: 그라데이션이면 그림을 만들어(색마다 파일 하나) 깔고, 아니면 nav 한 색.
// 메인 카드 둘레 선도 바탕에 맞춘다. 레이아웃 파일(layouts/slack.json)의 이 둘만 고쳐 쓴다.
// Herdr 는 파일이 바뀌면 바로 다시 그린다. (모드 안에서 보낸 layout.set 은 바탕을 바꾸지 못했다.)
// 레이아웃 값은 라이트·다크를 하나만 가지므로, 시스템 모드가 바뀌면 레일이 이 함수를 다시 부른다.
export async function applyBackground(theme = slackTheme(), light = isLight(herdrTheme())) {
  const { nav, selected } = windowColors(theme, light);
  let background = nav;
  if (theme.gradient) {
    const name = `backgrounds/slack-${nav.slice(1)}-${selected.slice(1)}.png`.toLowerCase();
    const out = `${appHome()}/${name}`;
    const r = await exec("sh", ["-c", `mkdir -p "$(dirname "$1")" && { [ -f "$1" ] || python3 -I "$2" "$1" "$3" "$4"; }`,
      "sh", out, `${appHome()}/mods/slack/gradient.py`, nav, selected]).catch(() => null);
    if (r && r.code === 0) background = { image: name, fit: "cover" };
  }
  const file = `${appHome()}/layouts/slack.json`;
  try {
    const tree = JSON.parse(await fs.readFile(file, "utf8"));
    const card = findNode(tree, "workspace");
    const border = cardBorder(light);
    if (JSON.stringify(tree.background) === JSON.stringify(background) && (!card || card.border?.color === border)) return;
    tree.background = background;
    if (card) card.border = { ...(card.border ?? { width: 1 }), color: border };
    await fs.writeFile(file, `${JSON.stringify(tree, null, 2)}\n`);
  } catch (error) {
    notify({ title: "테마 바탕을 바꾸지 못했어요", body: String(error?.message ?? error), level: "error" });
  }
}

// 라이트/다크: Herdr settings.json 의 appearance 가 유일한 출처다("light" | "dark", 없으면 시스템을 따른다).
// 테마 창은 이 값만 읽고 쓴다. 바뀌면 Herdr 가 {light, dark} 테마를 바꾸고, 레일이 창 바탕을 다시 그린다.
export const APPEARANCES = [
  { id: "system", name: "시스템" },
  { id: "light", name: "라이트" },
  { id: "dark", name: "다크" },
];
const settingsFile = () => `${appHome()}/settings.json`;

async function readSettings() {
  try {
    return JSON.parse(await fs.readFile(settingsFile(), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

export function readAppearance() {
  const value = settings()?.appearance;
  return value === "light" || value === "dark" ? value : "system";
}

// 다른 설정은 그대로 두고 appearance 만 바꾼다. 같은 값이면 쓰지 않는다. 성공하면 true.
export async function setAppearance(id) {
  try {
    const current = await readSettings();
    const next = { ...current };
    if (id === "light" || id === "dark") next.appearance = id;
    else delete next.appearance;
    if (current.appearance === next.appearance) return true;
    await fs.writeFile(settingsFile(), `${JSON.stringify(next, null, 2)}\n`);
    return true;
  } catch (error) {
    notify({ title: "화면 모드를 바꾸지 못했어요", body: String(error?.message ?? error), level: "error" });
    return false;
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
