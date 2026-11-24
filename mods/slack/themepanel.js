// '테마' 창(레일의 달 버튼): 기본 테마를 고르거나 네 가지 색과 창 그라데이션을 직접 정한다.
// 바꾸는 즉시 적용된다. 창 바탕 그림은 색 입력이 멈추고 0.5초 뒤에 한 번만 다시 만든다.
import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { props, closeOverlay } from "herdr";
import { PRESETS, APPEARANCES, slackTheme, setSlackTheme, applyBackground, pickColor, isHex, normHex, readAppearance, setAppearance } from "./theme.js";
import { icon, strong } from "./parts.js";

const FIELDS = [
  { key: "nav", label: "시스템 탐색" },
  { key: "selected", label: "선택된 항목" },
  { key: "presence", label: "현재 상태" },
  { key: "notify", label: "알림" },
];
const BG_DELAY_MS = 500;

export const themeOverlay = () => ({ mod: "slack", kind: "dialog", width: 560, height: 600, props: { view: "theme" } });

export function initThemePanel(view, _cx) {
  const theme = slackTheme();
  view.colorInputs = {};
  view.bgTicket = 0;
  // Repaint the window background a moment after the last change (typing a hex value changes it often).
  view.scheduleBackground = (cx2) => {
    const ticket = ++view.bgTicket;
    cx2.timer.after(BG_DELAY_MS, (cx3) => {
      if (ticket !== view.bgTicket) return;
      cx3.spawn(async () => { await applyBackground(); });
    });
  };
  view.setColor = (key, hex, cx2) => {
    setSlackTheme({ preset: "custom", [key]: hex });
    if (key === "nav" || key === "selected") view.scheduleBackground(cx2);
    cx2.notify();
  };
  for (const f of FIELDS) {
    const input = InputState.new({ value: theme[f.key], placeholder: "#RRGGBB" });
    input.on("change", (_e, cx2) => {
      const v = input.value();
      if (isHex(v) && normHex(v) !== slackTheme()[f.key]) view.setColor(f.key, normHex(v), cx2);
    });
    view.colorInputs[f.key] = input;
  }
  view.usePreset = (preset, cx2) => {
    setSlackTheme({ ...preset, preset: preset.id });
    for (const f of FIELDS) view.colorInputs[f.key].set_value(preset[f.key]);
    view.scheduleBackground(cx2);
    cx2.notify();
  };
  view.pick = (key, cx2) => cx2.spawn(async (cx3) => {
    const hex = await pickColor(slackTheme()[key]);
    if (!hex) return;
    view.colorInputs[key].set_value(hex);
    view.setColor(key, hex, cx3);
  });
  // 화면 모드: settings() 에서 읽어 오고, 고르면 settings.json 에 쓴다(창은 보여 주기만 한다).
  view.appearance = readAppearance();
  view.useAppearance = (id, cx2) => {
    const before = view.appearance;
    view.appearance = id;
    cx2.notify();
    cx2.spawn(async (cx3) => {
      if (await setAppearance(id)) return;
      view.appearance = before;
      cx3.notify();
    });
  };
  view.toggleGradient = (cx2) => {
    setSlackTheme({ gradient: !slackTheme().gradient });
    view.scheduleBackground(cx2);
    cx2.notify();
  };
}

// 두 색을 반씩 칠한 동그라미(테마 고르기 칸).
function twoTone(a, b, size) {
  return h_flex().size(size).flex_none().rounded_full().overflow_hidden()
    .child(div().w(size / 2).h_full().rounded_l(size / 2).bg(a))
    .child(div().w(size / 2).h_full().rounded_r(size / 2).bg(b));
}

export function renderThemePanel(view, t) {
  const p = props() ?? {};
  const theme = slackTheme();
  const close = () => closeOverlay(p.overlay);
  const label = (text) => div().pt(14).pb(8).text_size(13).font_bold().text_color(strong(t)).child(text);
  const presetChip = (preset) => {
    const on = theme.preset === preset.id;
    return h_flex().id(`preset-${preset.id}`).w(160).h(40).px(8).gap(8).items_center().rounded(8).cursor_pointer()
      .border_1().border_color(on ? t.accent : t.border).bg(on ? t.raised : t.background)
      .hover((s) => s.border_color(t.accent))
      .on_click((_e, cx) => view.usePreset(preset, cx))
      .child(twoTone(preset.nav, preset.selected, 24))
      .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(on ? strong(t) : t.muted).child(preset.name));
  };
  const fit = (n) => n * 120 + (n - 1) * 3 + 6;
  const appearanceChip = (a) => {
    const on = view.appearance === a.id;
    return div().id(`appearance-${a.id}`).w(120).h(32).flex().items_center().justify_center().rounded(6).cursor_pointer()
      .text_size(13).font_bold().text_color(on ? strong(t) : t.muted)
      .when(on, (el) => el.bg(t.popover).shadow_sm())
      .when(!on, (el) => el.hover((s) => s.text_color(strong(t))))
      .on_click((_e, cx) => view.useAppearance(a.id, cx))
      .child(a.name);
  };
  const colorField = (f) => h_flex().w(248).h(40).px(8).gap(8).items_center().rounded(20)
    .border_1().border_color(theme[f.key]).bg(`${theme[f.key]}33`)
    .child(div().size(24).flex_none().rounded_full().bg(theme[f.key]).border_1().border_color("#ffffff40"))
    .child(div().flex_1().min_w(0).child(Input.new(view.colorInputs[f.key]).h(28).px(4).border_0().bg("#00000000")
      .text_size(14).text_color(strong(t))))
    .child(div().id(`pick-${f.key}`).size(28).flex_none().flex().items_center().justify_center().rounded_full()
      .cursor_pointer().text_color(t.muted).tooltip("색 고르기").hover((s) => s.bg(t.hover).text_color(strong(t)))
      .on_click((_e, cx) => view.pick(f.key, cx)).child(icon("square-pen", 15)));
  return v_flex().id("theme-panel").size_full().p(20).bg(t.popover)
    .on_key_down((e, cx) => { if (e.key === "escape") { close(); cx.stop_propagation(); } })
    .child(h_flex().items_center()
      .child(div().flex_1().text_size(20).font_bold().text_color(strong(t)).child("테마"))
      .child(div().id("theme-close").size(28).flex().items_center().justify_center().rounded(6).cursor_pointer()
        .text_size(18).text_color(t.muted).hover((s) => s.bg(t.hover).text_color(strong(t))).on_click(close).child("×")))
    .child(label("화면 모드"))
    .child(h_flex().w(fit(3)).p(3).gap(3).rounded(8).bg(t.raised).children(APPEARANCES.map(appearanceChip)))
    .child(label("기본 테마"))
    .child(h_flex().flex_wrap().gap(8).children(PRESETS.map(presetChip)))
    .child(label(theme.preset === "custom" ? "사용자 지정 (지금 쓰는 색)" : "사용자 지정"))
    .child(h_flex().flex_wrap().gap(12)
      .children(FIELDS.map((f) => v_flex().gap(6)
        .child(div().text_size(13).text_color(t.muted).child(f.label))
        .child(colorField(f)))))
    .child(h_flex().id("gradient-toggle").pt(16).gap(10).items_start().cursor_pointer()
      .on_click((_e, cx) => view.toggleGradient(cx))
      .child(div().size(18).mt(1).flex_none().rounded(4).flex().items_center().justify_center()
        .border_1().border_color(theme.gradient ? t.accent : t.input).bg(theme.gradient ? t.accent : "#00000000")
        .text_size(12).text_color(t.accent_foreground).child(theme.gradient ? "✓" : ""))
      .child(v_flex().gap(2)
        .child(div().text_size(14).font_bold().text_color(strong(t)).child("창 그라데이션"))
        .child(div().text_size(12).text_color(t.dim).child("창 배경에서 시스템 탐색과 선택된 항목 색상을 함께 혼합합니다."))));
}
