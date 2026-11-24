// 창 전체의 워크스페이스 이름·그림(레일 맨 위 타일, 사이드바 맨 위 이름).
// 채널이 스페이스가 되기 전에는 스페이스에 붙였으므로, 아직 없으면 이름 붙은 첫 스페이스의 이름·그림을 이어받는다.
import { shared, setShared, spaces } from "herdr";
import { SPACE_IMAGES_KEY } from "./parts.js";

const WORKSPACE_KEY = "slack.workspace";
export const DEFAULT_WORKSPACE = "Herdr";

export function workspace() {
  const d = shared("slack.demo");
  if (d) return { name: d.workspace ?? "Acme", image: null }; // 데모 모드(demo.js)
  const saved = shared(WORKSPACE_KEY);
  if (saved) return saved;
  // #일반 채널(스페이스 이름 '일반')은 워크스페이스 이름이 아니다.
  const named = spaces().find((s) => s.named && s.name !== "일반");
  const images = shared(SPACE_IMAGES_KEY) ?? {};
  const legacyImage = named ? images[named.id] : Object.values(images)[0];
  return { name: named?.name ?? DEFAULT_WORKSPACE, image: legacyImage ?? null };
}

export const setWorkspace = (patch) => setShared(WORKSPACE_KEY, { ...workspace(), ...patch });
