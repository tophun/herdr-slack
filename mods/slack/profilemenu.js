// 내 프로필(레일 맨 아래 아바타) 오른쪽 클릭 팝업과 이름 입력 팝업.
//   profile-menu  이름 바꾸기 · 원래 이름으로 · 사진 바꾸기 · 사진 지우기
//   profile-name  이름 입력(Enter 저장, Esc 취소)
import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { props, home, openOverlay, closeOverlay, setShared } from "herdr";
import { profile, setProfile } from "./spaceimage.js";
import { SPACE_IMAGE_REQUEST_KEY } from "./parts.js";

const ITEM = 32;
const GAP = 2;
const PAD = 6;

export const defaultName = () => String(home() ?? "").split("/").pop() || "me";
export const profileName = () => profile().name || defaultName();

function items() {
  const p = profile();
  return [
    { id: "name", label: "이름 바꾸기…", run: () => openOverlay({ mod: "slack", kind: "dialog", width: 360, height: 172, props: { view: "profile-name" } }) },
    p.name && { id: "unname", label: "원래 이름으로 되돌리기", run: () => setProfile({ name: null }) },
    { id: "pick", label: "프로필 사진 바꾸기…", ask: "profile-pick" },
    p.image && { id: "clear", label: "프로필 사진 지우기", ask: "profile-clear", danger: true },
  ].filter(Boolean);
}

export function profileMenuOverlay() {
  const n = items().length;
  return { mod: "slack", kind: "popup", width: 200, height: PAD * 2 + n * ITEM + (n - 1) * GAP, props: { view: "profile-menu" } };
}

export function renderProfileMenu(_view, t) {
  const p = props() ?? {};
  return v_flex().id("profile-menu").size_full().p(PAD).gap(GAP).bg(t.popover)
    .children(items().map((x) => div().id(x.id).h(ITEM).flex_none().px(8).flex().items_center().rounded(3).cursor_pointer()
      .text_size(14).font_medium().text_color(x.danger ? t.blocked : t.muted)
      .hover((s) => s.bg(x.danger ? t.blocked : t.accent).text_color(t.ansi15))
      .on_click(() => {
        // 사진 고르기는 팝업이 닫히면 끊기므로 늘 살아 있는 레일에 맡긴다.
        if (x.ask) setShared(SPACE_IMAGE_REQUEST_KEY, { action: x.ask, at: Date.now() });
        closeOverlay(p.overlay);
        x.run?.();
      })
      .child(x.label)));
}

// 이름 입력 팝업의 입력 상태: copy 의 init 에서 한 번 만든다.
export function initProfileName(view) {
  const current = profileName();
  view.nameInput = InputState.new({ value: current, placeholder: defaultName() });
  view.nameInput.set_selected_range({ start: 0, end: current.length });
  view.saveName = () => {
    const name = view.nameInput.value().trim();
    setProfile({ name: name && name !== defaultName() ? name : null });
    closeOverlay(props()?.overlay);
  };
  view.nameInput.on("submit", () => view.saveName());
  view.nameInput.focus();
}

export function renderProfileName(view, t) {
  const p = props() ?? {};
  const close = () => closeOverlay(p.overlay);
  const save = () => view.saveName();
  const button = (id, text, primary, action) => h_flex().id(id).h(32).px(14).items_center().rounded(6)
    .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
    .text_color(primary ? t.solid_foreground : t.foreground).text_size(13).font_bold().cursor_pointer()
    .hover((s) => s.opacity(0.88)).on_click(action).child(text);
  return v_flex().id("profile-name").size_full().p(18).gap(10).bg(t.popover)
    .on_key_down((e, cx) => { if (e.key === "escape") { close(); cx.stop_propagation(); } })
    .child(div().text_size(16).font_bold().text_color(t.ansi15).child("프로필 이름"))
    .child(Input.new(view.nameInput).h(36).px(10).rounded(6).border_1().border_color(t.accent).bg(t.background).text_size(14).text_color(t.foreground))
    .child(h_flex().pt(6).gap(8).justify_end()
      .child(button("pn-cancel", "취소", false, close))
      .child(button("pn-save", "저장", true, save)));
}
