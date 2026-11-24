// 맨 위 띠(44px, 그라데이션 위 투명): 창 버튼 자리 · 사이드바 접기, 가운데 ← → 와 넓은 검색창, 오른쪽 도움말.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { run, window, shared, setShared } from "herdr";
import { GLASS, icon, white, keepPress } from "./parts.js";

// macOS 창 버튼(layouts/slack.json 의 traffic_lights)이 앉는 왼쪽 자리.
const LIGHTS_MACOS = 84;
const LIGHTS = 12;
const SEARCH_MAX = 820;

function button(t, id, name, tip, action, size = 17) {
  return keepPress(div().id(id).size(28).flex_none().flex().items_center().justify_center().rounded(6)
    .cursor_pointer().text_color(white(t)).opacity(0.85).tooltip(tip)
    .hover((s) => s.bg(GLASS.hover).opacity(1)).on_click(action).child(icon(name, size)));
}

export function renderTopbar(_view, t) {
  const w = window();
  const left = w?.platform === "macos" && !w?.fullscreen ? LIGHTS_MACOS : LIGHTS;
  return h_flex().id("topbar").size_full().pl(left).pr(12).gap(6).items_center()
    // The window's width (the bar spans it), for slack-toast to sit at the top right.
    .on_size_change((size) => { if (Math.round(size.width) !== shared("slack.windowW")) setShared("slack.windowW", Math.round(size.width)); })
    .child(button(t, "toggle-sidebar", "sidebar", "사이드바 보이기/숨기기", () => run("layout.toggle", { id: "sidebar" })))
    .child(div().flex_1().min_w(8))
    .child(button(t, "prev", "arrow-left", "이전 채널", () => run("tab.prev")))
    .child(button(t, "next", "arrow-right", "다음 채널", () => run("tab.next")))
    .child(button(t, "recent", "clock", "최근 항목", () => run("mod.open", { name: "picker" })))
    .child(keepPress(h_flex().id("search").flex_1().min_w(200).max_w(SEARCH_MAX).h(30).px(10).gap(8).items_center()
      .rounded(7).bg(GLASS.field).border_1().border_color(GLASS.line).cursor_pointer()
      .hover((s) => s.bg(GLASS.selected)).tooltip("찾기 (⌘P)")
      .on_click(() => run("mod.open", { name: "picker" }))
      .child(div().text_color(white(t)).opacity(0.8).child(icon("search", 15)))
      .child(div().flex_1().min_w(0).truncate().text_size(14).text_color(white(t)).opacity(0.75)
        .child("무엇을 찾고 있는지 설명해 주세요"))))
    .child(div().flex_1().min_w(8))
    .child(button(t, "help", "help", "단축키 도움말", () => run("app.help"), 19));
}
