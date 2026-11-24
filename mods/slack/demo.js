// 데모 모드: 공유용 스크린샷을 찍을 때 실제 작업을 가린다. data/slack/demo.json 이 있으면 레일이 시작할 때
// 읽어 shared "slack.demo" 에 둔다: { folder, workspace, profile }. 켜져 있는 동안 사이드바·레일·머리줄은
// folder 아래의 채널(스페이스)과 그 에이전트만 보이고, 워크스페이스·프로필은 그림 없이 그 이름으로 보인다.
import { shared, setShared, spaces, agents, appHome } from "herdr";
import * as fs from "fs/promises";

export const demo = () => shared("slack.demo") ?? null;

export async function loadDemo() {
  let value = null;
  try { value = JSON.parse(await fs.readFile(`${appHome()}/data/slack/demo.json`, "utf8")); } catch {}
  if (JSON.stringify(value) !== JSON.stringify(shared("slack.demo") ?? null)) setShared("slack.demo", value);
}

const inDemo = (folder) => {
  const d = demo();
  return !d || String(folder ?? "").startsWith(d.folder);
};

// 화면에 보일 스페이스와 에이전트(데모 모드가 아니면 전부).
export const visibleSpaces = () => spaces().filter((s) => inDemo(s.folder));
export function visibleAgents() {
  const ids = new Set(visibleSpaces().map((s) => s.id));
  return agents().filter((a) => ids.has(a.space));
}


