// 사이드바 사용자 섹션(슬랙의 '사용자 지정 섹션'). 채널 = 스페이스(본 체크아웃·worktree)이고,
// 사용자 섹션에 넣지 않은 채널은 자기 저장소 섹션(없으면 '채널')에 나온다.
//   shared "slack.channelSections" { [scope]: [{ id, name, emoji?, tabs: [spaceId…] }] }   순서 = 사이드바 순서
//   shared "slack.collapsed"       { "<scope>:<sectionId>": true }                        접힌 섹션
// scope 는 지금 "all" 하나다(창 전체가 한 워크스페이스). 필드 이름 tabs 는 예전 형식을 따른 것이다.
import { shared, setShared } from "herdr";

const SECTIONS_KEY = "slack.channelSections";
export const SCOPE = "all";
const COLLAPSED_KEY = "slack.collapsed";

export function sectionsOf(spaceId) {
  return (shared(SECTIONS_KEY) ?? {})[spaceId] ?? [];
}

function save(spaceId, list) {
  setShared(SECTIONS_KEY, { ...(shared(SECTIONS_KEY) ?? {}), [spaceId]: list });
}

// 탭 하나는 한 섹션에만 둔다.
const without = (list, tabId) => list.map((s) => ({ ...s, tabs: s.tabs.filter((id) => id !== tabId) }));

export function createSection(spaceId, name, tabId = null, emoji = null) {
  // 시각만으로는 같은 ms 안에서 겹칠 수 있어 임의 꼬리를 붙인다.
  const id = `sec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const list = tabId ? without(sectionsOf(spaceId), tabId) : sectionsOf(spaceId);
  save(spaceId, [...list, { id, name, emoji: emoji || null, tabs: tabId ? [tabId] : [] }]);
  return id;
}

export function renameSection(spaceId, sectionId, name, emoji = null) {
  save(spaceId, sectionsOf(spaceId).map((s) => (s.id === sectionId ? { ...s, name, emoji: emoji || null } : s)));
}

// 지우면 안의 채널은 기본 '채널' 섹션으로 돌아간다.
export function deleteSection(spaceId, sectionId) {
  save(spaceId, sectionsOf(spaceId).filter((s) => s.id !== sectionId));
}

// sectionId 가 null 이면 기본 '채널' 섹션으로.
export function moveTab(spaceId, tabId, sectionId) {
  const list = without(sectionsOf(spaceId), tabId);
  save(spaceId, sectionId ? list.map((s) => (s.id === sectionId ? { ...s, tabs: [...s.tabs, tabId] } : s)) : list);
}

// 섹션 순서 바꾸기: by = -1(위로) | +1(아래로).
export function shiftSection(spaceId, sectionId, by) {
  const list = [...sectionsOf(spaceId)];
  const i = list.findIndex((s) => s.id === sectionId);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  save(spaceId, list);
}

export function sectionOfTab(spaceId, tabId) {
  return sectionsOf(spaceId).find((s) => s.tabs.includes(tabId)) ?? null;
}

export const isCollapsed = (spaceId, sectionId) => Boolean((shared(COLLAPSED_KEY) ?? {})[`${spaceId}:${sectionId}`]);

export function toggleCollapsed(spaceId, sectionId) {
  const all = { ...(shared(COLLAPSED_KEY) ?? {}) };
  const key = `${spaceId}:${sectionId}`;
  if (all[key]) delete all[key]; else all[key] = true;
  setShared(COLLAPSED_KEY, all);
}

// 사이드바에 그릴 묶음: 사용자 섹션들(있는 탭만) + 기본 '채널'(나머지 탭).
export function groupTabs(spaceId, tabs) {
  const live = new Set(tabs.map((t) => t.id));
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const custom = sectionsOf(spaceId).map((s) => ({
    ...s, custom: true, items: s.tabs.filter((id) => live.has(id)).map((id) => byId.get(id)),
  }));
  const placed = new Set(custom.flatMap((s) => s.items.map((t) => t.id)));
  return { custom, rest: tabs.filter((t) => !placed.has(t.id)) };
}
