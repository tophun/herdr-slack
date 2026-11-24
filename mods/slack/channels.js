// 사이드바(반투명, 그라데이션 위). 레일에서 고른 화면에 따라:
//   home      워크스페이스 이름 · 대화 찾기 · 빠른 메뉴 · 사용자 섹션 · 저장소 섹션(채널 = 스페이스: 본 체크아웃·worktree)
//             · '채널'(저장소 밖 스페이스) · 다이렉트 메시지(= 지금 채널의 에이전트)
//   dms       모든 에이전트를 최근 순으로(슬랙 DM 목록)
//   activity  입력이 필요하거나 끝났는데 안 본 에이전트(슬랙 '내 활동')
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { panes, focused, run, openOverlay, shared, setShared, home } from "herdr";
import { cleanTitle, agentSubtitle, channelNames, groupByRepo } from "./look.js";
import { SCOPE, groupTabs, isCollapsed, toggleCollapsed } from "./sections.js";
import { channelMenuOverlay, sectionMenuOverlay, workspaceMenuOverlay, repoLook } from "./sectionmenu.js";
import { workspace } from "./workspace.js";
import { slackTheme } from "./theme.js";
import { visibleSpaces, visibleAgents } from "./demo.js";
import { repoPending } from "./repos.js";
import { VIEW_KEY, sidebarView, GLASS, icon, white, programAvatar, withStatusDot, mentionBadge } from "./parts.js";

const HEADER_HEIGHT = 52;
const ROW_HEIGHT = 28;
const CARD_HEIGHT = 56;
import { newChannelOverlay } from "./newchannel.js";
// 사이드바에서 만드는 채널은 새 스페이스(작업 폴더에서 시작).
const NEW_MENU = newChannelOverlay("space");

const agentName = (a) => cleanTitle(a.title) || a.program?.name || "에이전트";
const focusAgent = (a) => run("agent.focus", { terminal: a.address });
const openPicker = () => run("mod.open", { name: "picker" });

function iconButton(t, id, name, tip, action) {
  return div().id(id).size(30).flex_none().flex().items_center().justify_center().rounded(6)
    .text_color(white(t)).cursor_pointer().tooltip(tip).hover((s) => s.bg(GLASS.hover))
    .on_click(action).child(icon(name, 18));
}

function header(t, title, onTitle) {
  return h_flex().id("sidebar-header").h(HEADER_HEIGHT).flex_none().pl(16).pr(8).gap(2).items_center()
    .child(h_flex().id("ws-title").flex_1().min_w(0).gap(4).items_center()
      .when(Boolean(onTitle), (el) => el.cursor_pointer().on_click(onTitle).tooltip("워크스페이스 메뉴 (이름 · 그림 바꾸기)"))
      .child(div().min_w(0).truncate().text_size(18).font_bold().text_color(white(t)).child(title))
      .when(Boolean(onTitle), (el) => el.child(div().text_color(white(t)).child(icon("chevron-down", 16)))))
    .child(iconButton(t, "settings", "settings", "설정", () => run("app.settings")))
    .child(iconButton(t, "compose", "square-pen", "새 채널 (작업 폴더에서 에이전트 시작)", () => openOverlay(NEW_MENU)));
}

function findBox(t, label) {
  return h_flex().id("find").mx(12).mb(6).h(28).flex_none().px(8).gap(8).items_center().rounded(6)
    .bg(GLASS.field).border_1().border_color(GLASS.line).cursor_pointer().hover((s) => s.bg(GLASS.selected))
    .on_click(openPicker)
    .child(div().text_color(white(t)).opacity(0.8).child(icon("search-text", 15)))
    .child(div().flex_1().truncate().text_size(14).text_color(white(t)).opacity(0.75).child(label));
}

// 한 줄(빠른 메뉴 · 채널 · DM 공통 틀). 고르면 흰 반투명, 안 본 것은 굵은 흰 글씨.
function row(t, id, { selected, bright, children, onClick, onRight, onDouble, indent = 10 }) {
  return h_flex().id(id).mx(8).h(ROW_HEIGHT).flex_none().pl(indent).pr(10).gap(8).items_center().rounded(6).cursor_pointer()
    .text_size(15).text_color(selected || bright ? white(t) : t.muted)
    .when(bright || selected, (el) => el.font_bold())
    .when(selected, (el) => el.bg(slackTheme().selected))
    .when(!selected, (el) => el.hover((s) => s.bg(GLASS.hover)))
    .when(Boolean(onDouble), (el) => el.on_mouse_down("left", (e) => { if (e.click_count === 2) onDouble(); }))
    .on_click(onClick)
    .when(Boolean(onRight), (el) => el.on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); onRight(); }))
    .children(children);
}

function quickLink(t, id, iconName, label, count, action) {
  return row(t, `quick-${id}`, {
    bright: count > 0, onClick: action,
    children: [div().opacity(0.9).child(icon(iconName, 16)), div().flex_1().truncate().child(label),
      count > 0 ? mentionBadge(t, count) : null].filter(Boolean),
  });
}

// 섹션 머리: 누르면 접기/펴기(접힌 ▸), 오른쪽 클릭은 섹션 메뉴(onMenu 가 있을 때).
// 이모지가 있으면 화살표 자리에 이모지를 두고, 마우스를 올린 동안만 화살표를 보인다(슬랙처럼).
function section(view, t, spaceId, id, label, { onMenu = null, emoji = null } = {}) {
  const collapsed = spaceId ? isCollapsed(spaceId, id) : false;
  const hovered = view?.hoverSection === id;
  const caret = icon(collapsed ? "chevron-right" : "chevron-down", 14);
  return h_flex().id(`sec-${id}`).h(ROW_HEIGHT).mt(14).mx(8).px(8).gap(10).items_center().flex_none().rounded(6)
    .text_size(15).text_color(t.muted).cursor_pointer().hover((s) => s.bg(GLASS.hover))
    .when(Boolean(emoji) && Boolean(view), (el) => el.on_hover((on, cx) => {
      const next = on ? id : view.hoverSection === id ? null : view.hoverSection;
      if (next !== view.hoverSection) { view.hoverSection = next; cx.notify(); }
    }))
    .when(Boolean(spaceId), (el) => el.on_click(() => toggleCollapsed(spaceId, id)))
    .when(Boolean(onMenu), (el) => el.on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); onMenu(); }))
    .child(div().w(18).flex_none().flex().items_center().justify_center()
      .child(emoji && !hovered ? div().text_size(15).child(emoji) : caret))
    .child(div().flex_1().truncate().child(label));
}

// 채널(= 스페이스) 표시: 입력 필요한 에이전트 수, 작업 중인지, 끝났는데 안 본 것.
function spaceBadge(space, all) {
  const mine = all.filter((a) => a.space === space.id);
  return { blocked: mine.filter((a) => a.status === "blocked").length, working: mine.some((a) => a.status === "working"), unread: space.status === "done" };
}

// 접힌 섹션에도 남기는 채널: 지금 채널, 입력이 필요하거나 안 본 것(슬랙처럼).
function stillShown(space, all) {
  const badge = spaceBadge(space, all);
  return space.active || badge.unread || badge.blocked > 0;
}

const tilde = (path) => (path === home() ? "~" : path?.startsWith(`${home()}/`) ? `~${path.slice(home().length)}` : path);

function channelRow(t, space, all, repoName, names) {
  const badge = spaceBadge(space, all);
  const tip = [tilde(space.folder), space.branch ? `⎇ ${space.branch}` : null].filter(Boolean).join(" · ");
  return row(t, `ch-${space.id}`, {
    selected: space.active, indent: 18,
    bright: badge.unread || badge.blocked > 0,
    onClick: () => { setShared(VIEW_KEY, "home"); run("space.select", { id: space.id }); },
    onDouble: () => run("space.rename", { id: space.id }),
    onRight: () => openOverlay(channelMenuOverlay(space.id, repoName)),
    children: [
      div().opacity(0.85).child(icon("hash", 16)),
      div().flex_1().min_w(0).truncate().when(Boolean(tip), (el) => el.tooltip(tip)).child(names.get(space.id) ?? space.name),
      badge.blocked > 0 ? mentionBadge(t, badge.blocked)
        : badge.working ? div().size(8).rounded_full().bg(t.working).loop("opacity", { from: 0.45, to: 1, period: 1400 })
          : null,
    ].filter(Boolean),
  });
}

function dmRow(t, a) {
  return row(t, `dm-${a.address}`, {
    selected: false, indent: 18,
    bright: a.focused || a.status === "blocked" || a.status === "done",
    onClick: () => focusAgent(a),
    children: [
      withStatusDot(t, programAvatar(t, a.program, 20), 20, a.status, GLASS.ring),
      div().flex_1().min_w(0).truncate().child(agentName(a)),
      a.status === "blocked" ? mentionBadge(t, 1) : null,
    ].filter(Boolean),
  });
}

function addRow(t, id, label, action) {
  return h_flex().id(id).mx(8).h(ROW_HEIGHT).flex_none().pl(16).pr(10).gap(8).items_center().rounded(6).cursor_pointer()
    .text_size(15).text_color(t.muted).hover((s) => s.bg(GLASS.hover)).on_click(action)
    .child(div().size(20).flex_none().rounded(5).bg(GLASS.field).flex().items_center().justify_center().child(icon("plus", 14)))
    .child(div().child(label));
}

function homeList(view, t, space) {
  const all = visibleAgents();
  // 저장소를 아직 모르는 새 채널은 '채널'에 먼저 그렸다가 저장소 섹션으로 옮겨지지 않도록 확인될 때까지 뺀다.
  const list = visibleSpaces().filter((s) => !repoPending(view, s));
  const mine = all.filter((a) => a.space === space.id);
  const repoOf = view.repoOf ?? {};
  // 사용자 섹션에 넣은 채널을 뺀 나머지를 저장소로 묶는다.
  const groups = groupTabs(SCOPE, list);
  const byRepo = groupByRepo(groups.rest, repoOf);
  const repoName = (s) => repoOf[s.folder]?.name ?? null;
  const names = channelNames(visibleSpaces(), all);
  const shownIn = (sectionId, items) => (isCollapsed(SCOPE, sectionId) ? items.filter((s) => stillShown(s, all)) : items);
  const attention = all.filter((a) => a.status === "blocked" || a.status === "done").length;
  const go = (name) => (_e, cx) => { setShared(VIEW_KEY, name); cx.notify(); };
  const repoSection = (r) => {
    const look = repoLook(r.root);
    const main = r.items.find((s) => s.folder === r.root) ?? r.items[0];
    return [
      section(view, t, SCOPE, r.id, look.name || r.name, { onMenu: () => openOverlay(sectionMenuOverlay(r.id, main?.id ?? null)), emoji: look.emoji }),
      ...shownIn(r.id, r.items).map((s) => channelRow(t, s, all, r.name, names)),
    ];
  };
  return v_flex().size_full()
    .child(header(t, workspace().name, () => openOverlay(workspaceMenuOverlay())))
    .child(findBox(t, "대화 찾기..."))
    .child(v_flex().id("sidebar-list").flex_1().min_h(0).pb(16).overflow_y_scroll()
      .child(quickLink(t, "unread", "inbox", "읽지 않은 항목", attention, go("activity")))
      .child(quickLink(t, "dms", "message-square", "다이렉트 메시지", 0, go("dms")))
      .child(quickLink(t, "directory", "book-user", "디렉터리", 0, openPicker))
      .child(div().mx(16).my(10).h(1).flex_none().bg(GLASS.line))
      .children(groups.custom.flatMap((sec) => [
        section(view, t, SCOPE, sec.id, sec.name, { onMenu: () => openOverlay(sectionMenuOverlay(sec.id)), emoji: sec.emoji }),
        ...shownIn(sec.id, sec.items).map((s) => channelRow(t, s, all, repoName(s), names)),
        ...(sec.items.length === 0 && !isCollapsed(SCOPE, sec.id)
          ? [div().id(`empty-${sec.id}`).mx(26).py(4).flex_none().text_size(13).text_color(t.dim).child("채널을 오른쪽 클릭해 이 섹션으로 옮기세요")] : []),
      ]))
      .children(byRepo.repos.flatMap(repoSection))
      .when(byRepo.loose.length > 0 || byRepo.repos.length === 0, (el) => el
        .child(section(view, t, SCOPE, "channels", "채널", { onMenu: () => openOverlay(sectionMenuOverlay("channels")) }))
        .children(shownIn("channels", byRepo.loose).map((s) => channelRow(t, s, all, null, names))))
      .child(addRow(t, "add-channel", "채널 추가", () => openOverlay(NEW_MENU)))
      .child(section(view, t, SCOPE, "dms", "다이렉트 메시지"))
      .when(!isCollapsed(SCOPE, "dms"), (el) => el.children(mine.map((a) => dmRow(t, a)))
        .when(mine.length === 0, (e2) => e2.child(div().mx(26).py(4).text_size(13).text_color(t.dim).child("이 채널엔 에이전트가 없어요")))));
}

// 카드 한 줄: 아바타, 이름, 아랫줄에 상태 · 워크스페이스 · #채널.
function agentCard(t, a, now, since) {
  const sub = `${agentSubtitle(a.status, since, now)} · ${a.space_name} · #${a.tab_name}`;
  return h_flex().id(`card-${a.address}`).mx(8).h(CARD_HEIGHT).flex_none().px(10).gap(10).items_center().rounded(8).cursor_pointer()
    .when(a.focused, (el) => el.bg(GLASS.selected))
    .when(!a.focused, (el) => el.hover((s) => s.bg(GLASS.hover)))
    .on_click(() => focusAgent(a))
    .child(withStatusDot(t, programAvatar(t, a.program, 36), 36, a.status, GLASS.ring))
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(div().truncate().text_size(15).font_bold().text_color(white(t)).child(agentName(a)))
      .child(div().truncate().text_size(13).text_color(a.status === "blocked" ? "#ff8fb1" : t.muted).child(sub)));
}

function agentList(t, title, list, empty) {
  const since = new Map(visibleSpaces().flatMap((s) => s.tabs.map((tab) => [tab.id, tab.working_since])));
  const now = Date.now();
  return v_flex().size_full()
    .child(header(t, title, null))
    .child(findBox(t, "대화 찾기..."))
    .child(v_flex().id("agent-list").flex_1().min_h(0).pt(4).pb(16).overflow_y_scroll()
      .when(list.length === 0, (el) => el.child(div().px(18).py(8).text_size(13).text_color(t.muted).child(empty)))
      .children(list.map((a) => agentCard(t, a, now, since.get(a.tab) ?? null))));
}

export function renderChannels(view, t, forced = null) {
  const mode = forced ?? sidebarView(shared);
  const shell = (child) => v_flex().id("sidebar").size_full().bg(GLASS.sidebar).child(child);
  if (mode === "dms") {
    return shell(agentList(t, "다이렉트 메시지", [...visibleAgents()].sort((a, b) => b.seq - a.seq),
      "아직 에이전트가 없어요. 오른쪽 위 연필을 눌러 Claude 를 시작해 보세요."));
  }
  if (mode === "activity") {
    const rank = { blocked: 0, done: 1 };
    const list = visibleAgents().filter((a) => a.status in rank).sort((a, b) => rank[a.status] - rank[b.status] || b.seq - a.seq);
    return shell(agentList(t, "내 활동", list, "확인할 것이 없어요. 입력이 필요하거나 끝난 에이전트가 여기 나와요."));
  }
  const space = visibleSpaces().find((s) => s.active) ?? visibleSpaces().find((s) => s.id === focused()?.space);
  if (!space) return shell(div().p(16).text_size(13).text_color(t.muted).child("워크스페이스가 없어요. 왼쪽 + 로 프로젝트를 여세요."));
  return shell(homeList(view, t, space));
}
