// 사이드바 팝업들. 채널 = 스페이스(본 체크아웃·worktree), 섹션 = 저장소(자동) 또는 사용자 섹션.
//   channel-menu    채널 오른쪽 클릭: 섹션으로 이동 · 새 섹션 · 채널 이름 · 새 worktree · 스페이스 메뉴
//   section-menu    섹션 머리 오른쪽 클릭: 이름·이모지 · 위/아래 · 새 섹션 · 새 worktree · 삭제
//   workspace-menu  워크스페이스(레일 타일·사이드바 맨 위 이름): 이름 · 그림
//   name-dialog     이름(+이모지) 입력. mode: new | rename | repo | workspace
import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { props, spaces, run, openOverlay, closeOverlay, shared, setShared } from "herdr";
import { SCOPE, sectionsOf, sectionOfTab, createSection, renameSection, deleteSection, moveTab, shiftSection } from "./sections.js";
import { workspace, setWorkspace } from "./workspace.js";
import { icon, SPACE_IMAGE_REQUEST_KEY } from "./parts.js";

const ITEM = 30;
const LABEL = 24;
const SEP = 5;
const GAP = 1;
const PAD = 6;

// 저장소 섹션의 표시 이름·이모지(자동 섹션이라 따로 둔다): { [repoRoot]: { name?, emoji? } }.
const REPO_KEY = "slack.repoSections";
export const repoLook = (root) => (shared(REPO_KEY) ?? {})[root] ?? {};
const setRepoLook = (root, look) => setShared(REPO_KEY, { ...(shared(REPO_KEY) ?? {}), [root]: look });

const nameDialog = (p) => ({ mod: "slack", kind: "dialog", width: 420, height: p.mode === "workspace" ? 172 : 268, props: { view: "name-dialog", ...p } });
// 섹션 머리에 자주 쓰는 이모지. 칸에 직접 적거나 붙여 넣어도 된다(⌃⌘Space 이모지 창).
const EMOJIS = ["😊", "🚀", "🔥", "⭐", "📌", "🛠️", "🐛", "✅", "👀", "💬", "📦", "🧪", "📈", "🎯", "💡", "🧭"];

const worktreeNew = (spaceId) => openOverlay({ mod: "worktree", kind: "dialog", props: { space: spaceId, action: "new" } });

function channelItems(spaceId, repoName) {
  const here = sectionOfTab(SCOPE, spaceId);
  const space = spaces().find((s) => s.id === spaceId);
  return [
    { label: "섹션으로 이동" },
    ...sectionsOf(SCOPE).map((s) => ({ id: `to-${s.id}`, text: s.name, on: here?.id === s.id, run: () => moveTab(SCOPE, spaceId, s.id) })),
    { id: "to-home", text: repoName ?? "채널", on: !here, run: () => moveTab(SCOPE, spaceId, null) },
    { id: "new", text: "새 섹션 만들기…", icon: "plus", run: () => openOverlay(nameDialog({ mode: "new", tab: spaceId })) },
    { sep: true },
    { id: "rename", text: "채널 이름 바꾸기…", run: () => run("space.rename", { id: spaceId }) },
    space?.named && { id: "unname", text: "브랜치 이름으로 되돌리기", run: () => run("space.rename", { id: spaceId, name: "" }) },
    repoName && { id: "worktree", text: "새 worktree…", run: () => worktreeNew(spaceId) },
    { id: "space-menu", text: "스페이스 메뉴", run: () => openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: spaceId } } }) },
  ].filter(Boolean);
}

// sectionId: 사용자 섹션 id | "repo:<root>" | "channels"(저장소 밖 채널).
function sectionItems(sectionId, mainSpaceId) {
  const newSection = { id: "new", text: "새 섹션 만들기…", icon: "plus", run: () => openOverlay(nameDialog({ mode: "new" })) };
  if (sectionId === "channels") return [newSection];
  if (sectionId.startsWith("repo:")) {
    const root = sectionId.slice(5);
    const look = repoLook(root);
    return [
      { id: "rename", text: "이름·이모지 바꾸기…", run: () => openOverlay(nameDialog({ mode: "repo", root, value: look.name ?? "", emoji: look.emoji ?? "" })) },
      mainSpaceId && { id: "worktree", text: "새 worktree…", run: () => worktreeNew(mainSpaceId) },
      newSection,
    ].filter(Boolean);
  }
  const list = sectionsOf(SCOPE);
  const i = list.findIndex((s) => s.id === sectionId);
  const section = list[i];
  return [
    { id: "rename", text: "이름·이모지 바꾸기…", run: () => openOverlay(nameDialog({ mode: "rename", section: sectionId, value: section?.name ?? "", emoji: section?.emoji ?? "" })) },
    i > 0 && { id: "up", text: "위로 옮기기", run: () => shiftSection(SCOPE, sectionId, -1) },
    i >= 0 && i < list.length - 1 && { id: "down", text: "아래로 옮기기", run: () => shiftSection(SCOPE, sectionId, 1) },
    newSection,
    { sep: true },
    { id: "delete", text: "섹션 삭제 (채널은 원래 섹션으로)", danger: true, run: () => deleteSection(SCOPE, sectionId) },
  ].filter(Boolean);
}

function workspaceItems() {
  const ask = (action) => () => setShared(SPACE_IMAGE_REQUEST_KEY, { action, at: Date.now() });
  return [
    { id: "rename", text: "워크스페이스 이름 바꾸기…", run: () => openOverlay(nameDialog({ mode: "workspace", value: workspace().name })) },
    { id: "pick", text: "워크스페이스 그림 바꾸기…", run: ask("workspace-pick") },
    workspace().image && { id: "clear", text: "워크스페이스 그림 지우기", danger: true, run: ask("workspace-clear") },
  ].filter(Boolean);
}

function heightOf(list) {
  const h = list.reduce((sum, x) => sum + (x.sep ? SEP : x.label ? LABEL : ITEM), 0);
  return PAD * 2 + h + (list.length - 1) * GAP;
}

export const channelMenuOverlay = (spaceId, repoName) => ({ mod: "slack", kind: "popup", width: 240,
  height: heightOf(channelItems(spaceId, repoName)), props: { view: "channel-menu", space: spaceId, repo: repoName } });
export const sectionMenuOverlay = (sectionId, mainSpaceId = null) => ({ mod: "slack", kind: "popup", width: 240,
  height: heightOf(sectionItems(sectionId, mainSpaceId)), props: { view: "section-menu", section: sectionId, main: mainSpaceId } });
export const workspaceMenuOverlay = () => ({ mod: "slack", kind: "popup", width: 240,
  height: heightOf(workspaceItems()), props: { view: "workspace-menu" } });

function menu(t, list) {
  const p = props() ?? {};
  return v_flex().id("menu").size_full().p(PAD).gap(GAP).bg(t.popover)
    .children(list.map((x, i) => {
      if (x.sep) return div().id(`sep-${i}`).h(1).mx(4).my(2).flex_none().bg(t.border);
      if (x.label) return div().id(`label-${i}`).h(LABEL).px(8).flex().items_end().pb(2).flex_none().text_size(12).font_bold().text_color(t.dim).child(x.label);
      return h_flex().id(x.id).h(ITEM).flex_none().px(8).gap(8).items_center().rounded(3).cursor_pointer()
        .text_size(14).font_medium().text_color(x.danger ? t.blocked : t.muted)
        .hover((s) => s.bg(x.danger ? t.blocked : t.accent).text_color(t.ansi15))
        .on_click(() => { closeOverlay(p.overlay); x.run(); })
        .child(div().w(14).flex_none().child(x.icon ? icon(x.icon, 14) : x.on ? "✓" : ""))
        .child(div().flex_1().truncate().child(x.text));
    }));
}

export const renderChannelMenu = (_view, t) => menu(t, channelItems(props()?.space, props()?.repo ?? null));
export const renderSectionMenu = (_view, t) => menu(t, sectionItems(props()?.section, props()?.main ?? null));
export const renderWorkspaceMenu = (_view, t) => menu(t, workspaceItems());

// 이름 입력: copy 의 init 에서 입력 상태를 한 번 만든다.
export function initNameDialog(view) {
  const p = props() ?? {};
  const current = p.value ?? "";
  view.nameInput = InputState.new({ value: current, placeholder: p.mode === "workspace" ? "예: 우리 팀" : p.mode === "repo" ? "비우면 저장소 이름" : "예: 진행 중, 리뷰, 운영" });
  if (current) view.nameInput.set_selected_range({ start: 0, end: current.length });
  view.emojiInput = InputState.new({ value: p.emoji ?? "", placeholder: "🙂" });
  view.saveName = () => {
    const name = view.nameInput.value().trim();
    const emoji = view.emojiInput.value().trim();
    if (p.mode === "workspace") { if (name) setWorkspace({ name }); }
    else if (p.mode === "repo") setRepoLook(p.root, { name: name || null, emoji: emoji || null });
    else if (!name) return;
    else if (p.mode === "rename") renameSection(SCOPE, p.section, name, emoji);
    else createSection(SCOPE, name, p.tab ?? null, emoji);
    closeOverlay(p.overlay);
  };
  view.nameInput.on("submit", () => view.saveName());
  view.emojiInput.on("submit", () => view.saveName());
  view.nameInput.focus();
}

const TITLES = { new: "새 섹션 만들기", rename: "섹션 이름·이모지 바꾸기", repo: "저장소 섹션 이름·이모지", workspace: "워크스페이스 이름" };

export function renderNameDialog(view, t) {
  const p = props() ?? {};
  const close = () => closeOverlay(p.overlay);
  const withEmoji = p.mode !== "workspace";
  const button = (id, text, primary, action) => h_flex().id(id).h(32).px(14).items_center().rounded(6)
    .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
    .text_color(primary ? t.solid_foreground : t.foreground).text_size(13).font_bold().cursor_pointer()
    .hover((s) => s.opacity(0.88)).on_click(action).child(text);
  const nameField = Input.new(view.nameInput).h(36).px(10).rounded(6).border_1().border_color(t.accent).bg(t.background).text_size(14).text_color(t.foreground);
  return v_flex().id("name-dialog").size_full().p(18).gap(10).bg(t.popover)
    .on_key_down((e, cx) => { if (e.key === "escape") { close(); cx.stop_propagation(); } })
    .child(div().text_size(16).font_bold().text_color(t.ansi15).child(TITLES[p.mode] ?? TITLES.new))
    .when(!withEmoji, (el) => el.child(nameField))
    .when(withEmoji, (el) => el
      .child(h_flex().gap(8).items_center()
        .child(Input.new(view.emojiInput).w(52).h(36).px(10).rounded(6).border_1().border_color(t.input).bg(t.background).text_size(18).text_color(t.foreground))
        .child(div().flex_1().min_w(0).child(nameField)))
      .child(div().text_size(12).text_color(t.dim).child("이모지 (선택): 아래에서 고르거나 왼쪽 칸에 직접 넣으세요"))
      .child(h_flex().flex_wrap().gap(2)
        .children([...EMOJIS, ""].map((e, i) => div().id(`emoji-${i}`).size(30).flex().items_center().justify_center().rounded(6).cursor_pointer()
          .text_size(e ? 18 : 12).text_color(t.dim).when(view.emojiInput.value() === e, (x) => x.bg(t.raised))
          .hover((s) => s.bg(t.raised)).tooltip(e ? e : "이모지 없음")
          .on_click((_e, cx) => { view.emojiInput.set_value(e); cx.notify(); }).child(e || "없음")))))
    .child(h_flex().pt(6).gap(8).justify_end()
      .child(button("nd-cancel", "취소", false, close))
      .child(button("nd-save", p.mode === "new" ? "만들기" : "저장", true, () => view.saveName())));
}
