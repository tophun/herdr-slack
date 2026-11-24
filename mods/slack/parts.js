// 슬랙 풍 블록들이 함께 쓰는 조각: 아이콘, 둥근 네모 아바타, 상태 점, 뱃지, 공유 키.
import { div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { slackTheme, isLight } from "./theme.js";

// 사이드바가 보여 줄 화면: "home"(채널·DM) | "dms"(모든 에이전트) | "activity"(입력 필요·안 본 완료).
// 레일이 쓰고 사이드바가 읽는다.
export const VIEW_KEY = "slack.view";
export const sidebarView = (shared) => shared(VIEW_KEY) ?? "home";

// 창 바탕(그라데이션) 위에 얹는 반투명 색(테마 이름으로는 못 쓰는 값들).
// 다크: 어두운 바탕 위 흰 덧칠. 라이트: 밝게 섞은 바탕 위 어두운 덧칠.
const GLASS_DARK = {
  sidebar: "#00000047", // 사이드바 바탕
  ring: "#2a0f2c",      // 사이드바 위 상태 점 둘레(반투명 바탕과 비슷한 불투명색)
  hover: "#ffffff17",
  selected: "#ffffff30",
  line: "#ffffff1f",
  field: "#ffffff1f",   // 검색창·버튼 바탕
  blockedText: "#ff8fb1", // 입력 필요 부제(어두운 반투명 바탕에서 t.blocked 는 너무 어둡다)
};
const GLASS_LIGHT = {
  sidebar: "#ffffff73",
  ring: "#ffffff",
  hover: "#1d1c1d0f",
  selected: "#1d1c1d1a",
  line: "#1d1c1d1f",
  field: "#ffffffb3",
  blockedText: null,    // 테마의 blocked 를 그대로
};
export const glass = (t) => (isLight(t) ? GLASS_LIGHT : GLASS_DARK);
// 다른 모드가 남기는 값(없어도 된다).
export const SPACE_COLORS_KEY = "space.colors";
// 워크스페이스 그림: { 스페이스 id: 앱 홈 기준 png 경로 }, 그리고 팝업이 레일에 남기는 요청.
export const SPACE_IMAGES_KEY = "slack.spaceImages";
export const SPACE_IMAGE_REQUEST_KEY = "slack.spaceImageRequest";
// 내 프로필: { name?, image? }. 채팅(slack-chat)도 슬랙 레이아웃에서 이 이름과 사진을 쓴다.
export const PROFILE_KEY = "slack.profile";

export const icon = (name, size) => svg(`mods/slack/${name}.svg`).size(size).flex_none();

// 가장 진한 글자(제목, 고른 탭). 다크에선 흰색(ansi15), 라이트에선 본문색. 나머지는 t.muted·t.dim,
// 색이 칠해진 칸(아바타·뱃지·고른 채널) 위에서는 t.accent_foreground(늘 흰색).
export const strong = (t) => (isLight(t) ? t.foreground : t.ansi15);

export function statusColor(t, status) {
  return { working: t.working, blocked: t.blocked, done: t.done, idle: t.idle }[status] ?? t.idle;
}

// 창을 끄는 블록(window_drag) 안의 버튼: 누름을 멈춰야 클릭이 된다.
export const keepPress = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());

// 슬랙 아바타: 둥근 네모(크기의 22%). 프로그램 아이콘을 tile 색(없으면 강조색) 위에 그린다.
export function programAvatar(t, program, size) {
  const glyph = Math.round(size * 0.62);
  const art = !program?.icon ? div().text_size(size * 0.45).font_bold().child((program?.name ?? "?").slice(0, 1))
    : program.tint ? svg(program.icon).size(glyph).text_color(program.color ?? t.accent_foreground)
      : image(program.icon).w(glyph).h(glyph);
  return div().size(size).flex_none().rounded(Math.round(size * 0.22)).flex().items_center().justify_center()
    .bg(program?.tile ?? t.accent).text_color(t.accent_foreground).child(art);
}

// 아바타 오른쪽 아래 상태 점(슬랙의 접속 표시). ring 은 점 둘레 바탕색.
export function withStatusDot(t, avatarEl, size, status, ring) {
  const dot = Math.max(8, Math.round(size * 0.36));
  return div().relative().flex_none().size(size).child(avatarEl)
    .child(div().absolute().right(-3).bottom(-3).size(dot + 4).rounded_full().bg(ring)
      .flex().items_center().justify_center()
      .child(div().size(dot).rounded_full().bg(statusColor(t, status))
        .when(status === "working", (el) => el.loop("opacity", { from: 0.45, to: 1, period: 1400 }))));
}

// 빨간 멘션 뱃지(입력이 필요한 에이전트 수).
export function mentionBadge(t, count) {
  return h_flex().h(18).min_w(18).px(6).rounded(9).flex_none().justify_center().items_center()
    .bg(slackTheme().notify).text_size(11).font_bold().text_color(t.accent_foreground)
    .child(count > 99 ? "99+" : String(count));
}
