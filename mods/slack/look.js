// 디스코드 풍 레이아웃의 순수 함수(Herdr 를 부르지 않아 Node 로 시험한다: tests/look.test.mjs).

// 멤버 목록 묶음 순서와 이름. 디스코드의 '온라인 — 3' 같은 역할 묶음 자리.
export const STATUS_ORDER = ["blocked", "working", "done", "idle"];
export const STATUS_LABEL = { blocked: "입력 필요", working: "작업 중", done: "완료", idle: "대기" };

const MAX_INITIALS = 3;
const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;
const JUST_STARTED_MS = MINUTE_MS;
const PLAN_NAMES = { team: "Team", max: "Max", pro: "Pro", free: "Free" };

// 서버 아이콘 글자: 단어마다 첫 글자(디스코드처럼), 최대 세 글자.
export function initials(name) {
  const words = String(name ?? "").trim().split(/[\s\-_./]+/u).filter(Boolean);
  const text = words.slice(0, MAX_INITIALS).map((w) => Array.from(w)[0]).join("");
  return text || "?";
}

// Claude Code 는 터미널 제목 앞에 상태 기호(✳ ◑ 점자 스피너)를 붙인다. 글자·숫자·경로 기호 앞까지 뗀다.
export function cleanTitle(title) {
  return String(title ?? "").replace(/^[^\p{L}\p{N}~/.]+/u, "").trim();
}

// 멤버 목록: 스페이스(없으면 전부)의 에이전트를 상태별로 묶는다. 빈 묶음은 뺀다.
export function memberGroups(agents, spaceId) {
  const mine = spaceId ? agents.filter((a) => a.space === spaceId) : agents;
  return STATUS_ORDER
    .map((status) => ({ status, label: STATUS_LABEL[status], items: mine.filter((a) => a.status === status) }))
    .filter((g) => g.items.length > 0);
}

// 채널(탭) 줄의 표시: 입력이 필요한 에이전트 수(빨간 멘션 뱃지), 작업 중인지, 안 본 완료(흰 점).
export function tabBadge(tab, agents) {
  const inTab = agents.filter((a) => a.tab === tab.id);
  return {
    blocked: inTab.filter((a) => a.status === "blocked").length,
    working: inTab.some((a) => a.status === "working"),
    unread: tab.status === "done",
  };
}

// 작업 시작 시각(ms)부터 지금까지.
export function elapsedText(sinceMs, nowMs) {
  if (typeof sinceMs !== "number") return "";
  const ms = nowMs - sinceMs;
  if (ms < JUST_STARTED_MS) return "방금 시작";
  const minutes = Math.floor(ms / MINUTE_MS);
  if (minutes < HOUR_MINUTES) return `${minutes}분째`;
  const hours = Math.floor(minutes / HOUR_MINUTES);
  const rest = minutes % HOUR_MINUTES;
  return rest > 0 ? `${hours}시간 ${rest}분째` : `${hours}시간째`;
}

// 멤버 이름 아래 한 줄(디스코드의 '플레이 중' 자리).
export function agentSubtitle(status, workingSince, nowMs) {
  if (status === "working") {
    const elapsed = elapsedText(workingSince, nowMs);
    return elapsed ? `작업 중 · ${elapsed}` : "작업 중";
  }
  if (status === "blocked") return "입력을 기다려요";
  if (status === "done") return "끝났어요 · 확인 전";
  return "대기 중";
}

const percent = (limit) => (limit && typeof limit.percent === "number" ? `${Math.round(limit.percent)}%` : null);

// 사용자 패널 아랫줄: claude-accounts 모드가 shared 에 남긴 계정 사용량.
export function usageText(usage) {
  if (!usage) return null;
  if (usage.status === "expired") return "토큰 만료";
  if (usage.status === "login-required") return "로그인 필요";
  if (usage.status !== "ok") return null;
  const parts = [["5h", percent(usage.session)], ["주간", percent(usage.weekly)]]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label} ${value}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function planLabel(subscriptionType) {
  if (!subscriptionType) return null;
  return PLAN_NAMES[subscriptionType] ?? subscriptionType;
}

// 채널(탭) 이름: 직접 붙인 이름이 있으면 그것, 없거나 프로그램 이름("Claude Code")뿐이면
// 그 탭의 작업 폴더 이름(홈이면 "~"). path 는 툴팁·머리줄에 쓰는 ~ 줄임 전체 경로.
export function channelLabel(tab, allPanes, homeDir) {
  const mine = allPanes.filter((p) => p.tab === tab.id);
  const pane = mine.find((p) => p.focused && p.program?.agent) ?? mine.find((p) => p.program?.agent)
    ?? mine.find((p) => p.focused) ?? mine[0];
  const cwd = pane?.cwd ?? null;
  const path = !cwd ? null : cwd === homeDir ? "~" : cwd.startsWith(`${homeDir}/`) ? `~${cwd.slice(homeDir.length)}` : cwd;
  const folder = !path ? null : path === "~" ? "~" : path.split("/").filter(Boolean).pop();
  const programNames = new Set(mine.map((p) => p.program?.name).filter(Boolean));
  const custom = tab.named && !programNames.has(tab.name) ? tab.name : null;
  return { name: custom ?? folder ?? tab.name, path, custom: Boolean(custom) };
}

// worktree 채널(= 스페이스) 이름: 직접 붙인 이름(첫 메시지로 만든 이름 포함) > 브랜치(feat/ 같은 접두사를 뗌)
// > 세션 제목(그 채널에서 가장 먼저 시작한 에이전트) > "새 채널"(겹치면 "새 채널 2", "새 채널 3" …).
const BRANCH_PREFIX = /^(feat|feature|fix|bugfix|hotfix|chore|refactor|docs|test|release)\//i;
export const NEW_CHANNEL = "새 채널";

export function spaceSessionTitle(space, agentList) {
  const first = agentList.filter((a) => a.space === space.id).sort((x, y) => x.seq - y.seq)[0];
  return first ? cleanTitle(first.title) : "";
}

function baseName(space, agentList) {
  if (space.named) return space.name;
  if (space.branch) return space.branch.replace(BRANCH_PREFIX, "");
  return spaceSessionTitle(space, agentList) || NEW_CHANNEL;
}

// 모든 채널 이름을 한 번에 정한다(번호를 매기려면 서로를 알아야 한다). 결과: Map(spaceId → 이름).
export function channelNames(spaceList, agentList) {
  const names = new Map();
  let fresh = 0;
  for (const s of spaceList) {
    const name = baseName(s, agentList);
    if (name !== NEW_CHANNEL) { names.set(s.id, name); continue; }
    fresh += 1;
    names.set(s.id, fresh === 1 ? NEW_CHANNEL : `${NEW_CHANNEL} ${fresh}`);
  }
  return names;
}

export const spaceChannelName = (space, spaceList = [space], agentList = []) =>
  channelNames(spaceList, agentList).get(space.id) ?? space.name;

// 첫 메시지로 채널 이름 만들기: 첫 줄, 40자까지.
export function nameFromMessage(text) {
  const line = String(text ?? "").trim().split("\n")[0].trim();
  return line.length > 40 ? `${line.slice(0, 39)}…` : line;
}

// 머리줄 탭 하나의 이름: 직접 붙인 탭 이름 > 에이전트 세션 제목 > 프로그램 이름 > 탭 번호.
export function tabTitle(tab, tabAgents, tabPanes) {
  const programs = new Set(tabPanes.map((p) => p.program?.name).filter(Boolean));
  if (tab.named && !programs.has(tab.name)) return tab.name;
  const agent = tabAgents.find((a) => a.focused) ?? tabAgents[0];
  const title = agent ? cleanTitle(agent.title) : "";
  return title || tabPanes.find((p) => p.focused)?.program?.name || tabPanes[0]?.program?.name || tab.name;
}

// 스페이스들을 저장소로 묶는다. repoOf: { [folder]: { root, name } | null } (git 이 알려 준 값).
export function groupByRepo(spaceList, repoOf) {
  const repos = new Map();
  const loose = [];
  for (const s of spaceList) {
    const repo = repoOf[s.folder] ?? null;
    if (!repo) { loose.push(s); continue; }
    if (!repos.has(repo.root)) repos.set(repo.root, { id: `repo:${repo.root}`, name: repo.name, root: repo.root, items: [] });
    repos.get(repo.root).items.push(s);
  }
  // 저장소 안에서는 본 체크아웃(폴더 = 저장소 루트)을 먼저.
  for (const r of repos.values()) r.items.sort((a, b) => (a.folder === r.root ? -1 : b.folder === r.root ? 1 : 0));
  return { repos: [...repos.values()].sort((a, b) => a.name.localeCompare(b.name)), loose };
}
