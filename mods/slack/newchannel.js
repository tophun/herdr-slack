// '새 채널' 창: 에이전트(또는 터미널)를 고르고, 작업 폴더와 이름을 정해 연다.
//   scope "space"  사이드바에서: 새 채널 = 새 스페이스(그 폴더가 git 저장소면 저장소 섹션에 들어간다)
//   scope "tab"    머리줄 + 에서: 지금 채널(스페이스) 안의 새 세션 탭
// 작업 폴더는 지금 채널의 폴더가 기본이고, 직접 적거나 '폴더 고르기…'로 바꿀 수 있다.
// 이 레이아웃에서는 에이전트 채널이 열리면 메시지(채팅) 보기로 연다(chatview.js).
import { div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Popup, ScrollHandle } from "gpui-base";
import { props, spaces, panes, home, knownAgents, pickFolder, run, exec, closeOverlay, notify, shared, setShared } from "herdr";
import * as fs from "fs/promises";
import { white, icon } from "./parts.js";
import { nameFromMessage } from "./look.js";
import { workspace, setWorkspace } from "./workspace.js";

// 작업 폴더 검색: 창을 열 때 홈 아래 폴더를 5단계까지 한 번 모은다(0.1초 안팎).
// 숨김 폴더(~/.config 는 남김), node_modules, Library, 앱·사진 보관함 같은 패키지, 빌드 결과는 뺀다.
const DIR_DEPTH = "5";
const PRUNE = [".*", "node_modules", "Library", "Applications", "*.app", "*.photoslibrary", "dist", "build", "target", "venv", "__pycache__"];
const MATCHES = 50;      // 후보 최대 개수(목록은 스크롤)
const VISIBLE_ROWS = 6;  // 스크롤 없이 보이는 줄 수
const ROW = 42;

function findArgs(homeDir) {
  const prune = PRUNE.flatMap((name, i) => [...(i ? ["-o"] : []), "-name", name, ...(name === ".*" ? ["!", "-name", ".config"] : [])]);
  return [homeDir, "-maxdepth", DIR_DEPTH, "(", ...prune, ")", "-prune", "-o", "-type", "d", "-print"];
}

// 검색어(공백으로 여러 낱말)가 모두 경로에 들어 있는 폴더. 마지막 이름이 검색어로 시작하면 먼저, 짧은 경로가 먼저.
export function matchDirs(dirs, query) {
  const words = String(query ?? "").toLowerCase().split(/[\s/]+/).filter(Boolean);
  if (!words.length) return [];
  const scored = [];
  for (const path of dirs) {
    const low = path.toLowerCase();
    if (!words.every((w) => low.includes(w))) continue;
    const base = low.slice(low.lastIndexOf("/") + 1);
    const last = words[words.length - 1];
    scored.push([base.startsWith(last) ? 0 : base.includes(last) ? 1 : 2, path.length, path]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, MATCHES).map((x) => x[2]);
}

const TERMINAL = { key: "terminal", name: "터미널", run: null };

export const newChannelOverlay = (scope = "tab") => ({ mod: "slack", kind: "dialog", width: 520, height: 476, props: { view: "new-channel", scope } });

const tilde = (path) => {
  const h = home();
  return path === h ? "~" : path?.startsWith(`${h}/`) ? `~${path.slice(h.length)}` : path;
};
const expand = (path) => (path === "~" ? home() : path.startsWith("~/") ? `${home()}${path.slice(1)}` : path);

// 지금 채널에서 키보드가 있는 창의 폴더(없으면 홈).
function currentFolder() {
  const space = spaces().find((s) => s.active);
  const tab = space?.tabs.find((t) => t.active);
  const mine = panes().filter((p) => p.tab === tab?.id && p.cwd);
  return (mine.find((p) => p.focused) ?? mine[0])?.cwd ?? home();
}

// #일반: 작업 폴더 없이 만든 세션을 모으는 채널(홈 폴더의 스페이스). 고른 스페이스 id 를 기억한다.
const GENERAL_KEY = "slack.general";
const GENERAL_NAME = "일반";
function generalSpace() {
  const list = spaces().filter((s) => !s.machine);
  const saved = list.find((s) => s.id === shared(GENERAL_KEY));
  if (saved) return saved;
  // 처음: 이름이 '일반'인 스페이스, 없으면 홈 폴더의 스페이스를 #일반으로 쓴다.
  const found = list.find((s) => s.named && s.name === GENERAL_NAME) ?? list.find((s) => s.folder === home());
  if (found) {
    // 워크스페이스 이름을 아직 이 스페이스 이름에서 읽고 있으면, 이름을 바꾸기 전에 따로 저장해 둔다.
    if (!shared("slack.workspace")) setWorkspace(workspace());
    setShared(GENERAL_KEY, found.id);
    if (!(found.named && found.name === GENERAL_NAME)) run("space.rename", { id: found.id, name: GENERAL_NAME });
  }
  return found ?? null;
}

export function initNewChannel(view, cx) {
  view.agents = null; // 불러오는 중
  view.choice = null;
  // 비워 두면 지금 채널의 폴더에서 시작한다(placeholder 가 그 폴더를 알려 준다).
  view.defaultFolder = currentFolder();
  view.folderInput = InputState.new({ placeholder: props()?.scope === "space"
    ? "폴더 검색 또는 경로 입력 · 비우면 #일반 채널에 탭으로 추가"
    : `폴더 검색 또는 경로 입력 · 비우면 ${tilde(view.defaultFolder)}` });
  view.nameInput = InputState.new({ placeholder: "비우면 작업 폴더 이름으로 보여요" });
  view.dirs = [];
  view.dirScroll = ScrollHandle.new();
  view.dirOpen = false;
  view.dirSel = 0;
  view.folderInput.on("change", (_e, cx2) => {
    if (view.settingFolder) return;
    view.dirOpen = true;
    view.dirSel = 0;
    view.dirScroll.scroll_to_item(0);
    cx2.notify();
  });
  // Enter: 후보가 열려 있으면 고른 후보로 채우고, 아니면 채널을 만든다.
  view.folderInput.on("submit", (_e, cx2) => {
    const list = view.dirMatches();
    if (view.dirOpen && list.length) view.chooseDir(list[Math.min(view.dirSel, list.length - 1)], cx2);
    else view.create(cx2);
  });
  view.dirMatches = () => matchDirs(view.dirs, view.folderInput.value());
  view.chooseDir = (path, cx2) => {
    view.settingFolder = true;
    view.folderInput.set_value(tilde(path));
    view.settingFolder = false;
    view.dirOpen = false;
    view.folderInput.focus();
    cx2.notify();
  };
  view.nameInput.on("submit", (_e, cx2) => view.create(cx2));
  // 첫 메시지: 에이전트에게 바로 보내고, 이름을 비우면 이 문장(첫 줄, 40자)이 채널·탭 이름이 된다.
  view.taskInput = InputState.new({ placeholder: "에이전트에게 바로 보낼 말 · 비우면 세션 제목이 이름이 돼요" });
  view.taskInput.on("submit", (_e, cx2) => view.create(cx2));
  view.folderInput.focus();
  // cx 는 부른 쪽(클릭·Enter)의 것을 받는다(init 의 cx 를 붙잡아 두지 않는다).
  view.create = (cx) => {
    if (view.creating) return;
    const typed = view.folderInput.value().trim();
    // 사이드바의 새 채널에서 작업 폴더를 비우면 새 채널 대신 #일반 채널에 탭으로 넣는다.
    const toGeneral = props()?.scope === "space" && !typed;
    const folder = typed ? expand(typed) : toGeneral ? home() : view.defaultFolder;
    const task = view.taskInput.value().trim();
    const name = view.nameInput.value().trim() || nameFromMessage(task);
    const agent = view.choice ?? TERMINAL;
    const space = spaces().find((s) => s.active);
    view.creating = true;
    cx.notify();
    cx.spawn(async (cx2) => {
      const ok = await fs.exists(folder).catch(() => false);
      if (!ok) {
        notify({ title: "작업 폴더가 없어요", body: folder, level: "error" });
        view.creating = false;
        cx2.notify();
        return;
      }
      const argv = agent.run ? { argv: agent.run, ...(task ? { task } : {}) } : {};
      const general = toGeneral ? generalSpace() : null;
      if (toGeneral && general) {
        run("tab.new", { space: general.id, folder, ...argv, ...(name ? { name } : {}) });
        run("space.select", { id: general.id });
      } else if (toGeneral) {
        // #일반이 아직 없으면 홈 폴더에 '일반'이라는 이름으로 만든다(다음부터는 이름으로 찾아 기억한다).
        run("space.new", { folder, name: GENERAL_NAME, ...argv, ...(name ? { tab: name } : {}) });
      } else if (props()?.scope === "space") run("space.new", { folder, ...argv, ...(name ? { name } : {}) });
      else run("tab.new", { ...(space ? { space: space.id } : {}), folder, ...argv, ...(name ? { name } : {}) });
      closeOverlay(props()?.overlay);
    });
  };
  view.pickFolder = (cx2) => cx2.spawn(async (cx3) => {
    const picked = await pickFolder({ prompt: "이 폴더에서 시작" });
    if (picked) view.folderInput.set_value(tilde(picked));
    cx3.notify();
  });
  cx.spawn(async () => {
    const r = await exec("find", findArgs(home())).catch(() => ({ stdout: "" }));
    view.dirs = String(r?.stdout ?? "").split("\n").filter(Boolean);
  });
  cx.spawn(async (cx2) => {
    const list = await knownAgents().catch(() => []);
    view.agents = list.filter((a) => a.installed);
    view.choice = view.agents[0] ?? TERMINAL;
    cx2.notify();
  });
}

function programIcon(t, program) {
  const box = div().size(22).flex_none().rounded(5).flex().items_center().justify_center().bg(program?.tile ?? t.raised);
  if (!program?.icon) return box.child(svg("mods/slack/terminal.svg").size(14).text_color(white(t)));
  return box.child(program.tint ? svg(program.icon).size(14).text_color(program.color ?? white(t)) : image(program.icon).size(14));
}

// 작업 폴더 칸 아래에 뜨는 후보 목록. Popup 은 창의 다른 내용보다 위 레이어에 그리고
// 창 가장자리 안에 자리 잡는다(absolute 로 그리면 뒤 형제에 가리고 창에 잘린다).
const DROPDOWN_WIDTH = 372;
function folderField(view, t, field) {
  const list = view.dirOpen ? view.dirMatches() : [];
  return Popup.new("dir-popup", field).anchor("top_left")
    .when(list.length > 0, (el) => el.content(dirDropdown(view, t, list)));
}

function dirDropdown(view, t, list) {
  return v_flex().id("dir-dropdown").w(DROPDOWN_WIDTH).max_h(VISIBLE_ROWS * (ROW + 1) + 8).mt(4).p(4).gap(1).rounded(8)
    .overflow_y_scroll().track_scroll(view.dirScroll)
    .border_1().border_color(t.input).bg(t.popover).shadow_lg()
    .children(list.map((path, i) => {
      // 고른 줄(키보드 ↑↓)은 툴팁이 없으니 경로를 자르지 않고 여러 줄로 펼친다.
      const on = i === view.dirSel;
      const line = (el) => (on ? el.whitespace_normal() : el.truncate());
      return h_flex().id(`dir-${i}`).min_h(ROW).flex_none().px(8).py(on ? 5 : 0).gap(10).items_center().rounded(6).cursor_pointer()
        .tooltip(path)
        .when(on, (el) => el.bg(t.raised))
        .hover((s) => s.bg(t.raised))
        .on_click((_e, cx) => view.chooseDir(path, cx))
        .child(div().text_color(t.dim).child(icon("folder", 18)))
        .child(v_flex().flex_1().min_w(0)
          .child(line(div().text_size(14).text_color(white(t))).child(tilde(path)))
          .child(line(div().text_size(12).text_color(t.dim)).child(path)));
    }));
}

export function renderNewChannel(view, t) {
  const p = props() ?? {};
  const close = () => closeOverlay(p.overlay);
  const label = (text) => div().pt(8).pb(4).text_size(13).font_bold().text_color(white(t)).child(text);
  const chip = (a) => {
    const on = (view.choice?.key ?? null) === a.key;
    return h_flex().id(`agent-${a.key}`).h(34).px(10).gap(8).items_center().rounded(6).cursor_pointer()
      .border_1().border_color(on ? t.accent : t.input).bg(on ? "#1d9bd122" : t.background)
      .text_size(14).font_medium().text_color(on ? white(t) : t.muted).hover((s) => s.border_color(t.accent))
      .on_click((_e, cx) => { view.choice = a; cx.notify(); })
      .child(programIcon(t, a.key === "terminal" ? null : a)).child(div().child(a.name));
  };
  const button = (id, text, primary, action) => h_flex().id(id).h(34).px(14).items_center().rounded(6)
    .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
    .text_color(primary ? t.solid_foreground : t.foreground).text_size(14).font_bold().cursor_pointer()
    .hover((s) => s.opacity(0.88)).on_click(action).child(text);
  // flex_none: 창보다 내용이 길어져도 입력칸이 눌려 낮아지지 않게.
  const field = (input) => Input.new(input).h(36).flex_none().px(10).rounded(6).border_1().border_color(t.input).bg(t.background)
    .text_size(14).text_color(t.foreground);
  return v_flex().id("new-channel").size_full().p(20).gap(4).bg(t.popover)
    .on_key_down((e, cx) => {
      const n = view.dirOpen ? view.dirMatches().length : 0;
      if (e.key === "escape") { if (n) view.dirOpen = false; else close(); cx.stop_propagation(); cx.notify(); }
      else if (n && (e.key === "down" || e.key === "up")) {
        view.dirSel = (view.dirSel + (e.key === "down" ? 1 : n - 1)) % n;
        view.dirScroll.scroll_to_item(view.dirSel);
        cx.stop_propagation();
        cx.notify();
      }
    })
    .child(div().pb(4).text_size(20).font_bold().text_color(white(t)).child(p.scope === "space" ? "새 채널" : "새 세션 (이 채널에 탭 추가)"))
    .child(label("에이전트"))
    .child(h_flex().gap(8).flex_wrap()
      .when(view.agents === null, (el) => el.child(div().h(34).flex().items_center().text_size(13).text_color(t.dim).child("설치된 에이전트를 찾는 중…")))
      .children((view.agents ?? []).map(chip))
      .child(chip(TERMINAL)))
    .child(label("작업 폴더"))
    .child(h_flex().flex_none().gap(8).items_center()
      .child(div().flex_1().min_w(0).child(folderField(view, t, field(view.folderInput))))
      .child(button("pick-folder", "폴더 고르기…", false, (_e, cx) => view.pickFolder(cx)).h(36)))
    .child(label(p.scope === "space" ? "채널 이름 (선택, 비우면 첫 메시지 → 브랜치 → 세션 제목)" : "탭 이름 (선택, 비우면 세션 제목)"))
    .child(field(view.nameInput))
    .child(label("첫 메시지 (선택)"))
    .child(field(view.taskInput))
    .child(div().flex_1())
    .child(h_flex().gap(8).justify_end()
      .child(button("nc-cancel", "취소", false, close))
      .child(button("nc-create", view.creating ? "여는 중…" : "만들기", true, (_e, cx) => view.create(cx))));
}
