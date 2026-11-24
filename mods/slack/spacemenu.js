// 워크스페이스(스페이스) 메뉴 팝업: 이름 바꾸기 · 이름 되돌리기 · 그림 바꾸기 · 그림 지우기 · 스페이스 메뉴.
// 레일 타일 오른쪽 클릭과 사이드바 맨 위 워크스페이스 이름 클릭이 연다.
import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { props, spaces, run, openOverlay, closeOverlay, setShared } from "herdr";
import { spaceImage } from "./spaceimage.js";
import { SPACE_IMAGE_REQUEST_KEY } from "./parts.js";

const ITEM = 32;
const GAP = 2;
const PAD = 6;
const SEP = 5;
const SPACE_MENU = (id) => ({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id } } });

function items(space) {
  return [
    { id: "rename", label: "워크스페이스 이름 바꾸기…", run: () => run("space.rename", { id: space.id }) },
    space.named && { id: "unname", label: "원래 이름으로 되돌리기", run: () => run("space.rename", { id: space.id, name: "" }) },
    { id: "pick", label: "워크스페이스 그림 바꾸기…", ask: "pick" },
    spaceImage(space.id) && { id: "clear", label: "워크스페이스 그림 지우기", ask: "clear", danger: true },
    { sep: true },
    { id: "space-menu", label: "스페이스 메뉴", run: () => openOverlay(SPACE_MENU(space.id)) },
  ].filter(Boolean);
}

// 팝업 크기를 항목 수에 맞춘다(여는 쪽이 쓴다).
export function spaceMenuOverlay(space) {
  const list = items(space);
  const rows = list.filter((x) => !x.sep).length;
  const seps = list.length - rows;
  const height = PAD * 2 + rows * ITEM + seps * SEP + (list.length - 1) * GAP;
  return { mod: "slack", kind: "popup", width: 220, height, props: { view: "space-menu", space: space.id } };
}

function item(t, x, act) {
  return div().id(x.id).h(ITEM).flex_none().px(8).flex().items_center().rounded(3).cursor_pointer()
    .text_size(14).font_medium().text_color(x.danger ? t.blocked : t.muted)
    .hover((s) => s.bg(x.danger ? t.blocked : t.accent).text_color(t.ansi15))
    .on_click(act).child(x.label);
}

export function renderSpaceMenu(_view, t) {
  const p = props() ?? {};
  const space = spaces().find((s) => s.id === p.space);
  const close = () => closeOverlay(p.overlay);
  if (!space) return div().size_full().bg(t.popover);
  return v_flex().id("space-menu").size_full().p(PAD).gap(GAP).bg(t.popover)
    .children(items(space).map((x, i) => x.sep
      ? div().id(`sep-${i}`).h(1).mx(4).my(2).flex_none().bg(t.border)
      : item(t, x, () => {
        // 그림 일은 팝업이 닫히면 끊기므로 늘 살아 있는 레일에 맡긴다.
        if (x.ask) setShared(SPACE_IMAGE_REQUEST_KEY, { space: space.id, action: x.ask, at: Date.now() });
        close();
        x.run?.();
      })));
}
