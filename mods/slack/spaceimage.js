// 서버(스페이스) 그림: 고른 그림을 가운데 정사각형으로 잘라 192px PNG 로 저장하고
// shared "slack.spaceImages" 에 { 스페이스 id: 앱 홈 기준 경로 } 로 남긴다.
import { exec, appHome, shared, setShared, notify } from "herdr";
import { SPACE_IMAGES_KEY, SPACE_IMAGE_REQUEST_KEY, PROFILE_KEY } from "./parts.js";
import { workspace, setWorkspace } from "./workspace.js";

const DIR = "data/slack/space-images";
const SIZE = 192;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|heic|tiff?|bmp)$/i;

export const isImagePath = (path) => IMAGE_EXT.test(path ?? "");

export function spaceImage(spaceId) {
  return (shared(SPACE_IMAGES_KEY) ?? {})[spaceId] ?? null;
}

function store(spaceId, path) {
  const next = { ...(shared(SPACE_IMAGES_KEY) ?? {}) };
  if (path) next[spaceId] = path; else delete next[spaceId];
  setShared(SPACE_IMAGES_KEY, next);
}

async function removeFile(rel) {
  if (rel?.startsWith(`${DIR}/`)) await exec("rm", ["-f", `${appHome()}/${rel}`]).catch(() => {});
}

// macOS 의 sips 로 가운데 정사각형을 잘라 SIZE px PNG 로 저장한다.
// 파일 이름에 시각을 넣어 같은 경로를 다시 쓰지 않는다(그림 캐시).
async function cropSquare(source, rel) {
  const r = await exec("sh", ["-c", `
    set -e
    mkdir -p "$(dirname "$2")"
    w=$(sips -g pixelWidth "$1" | awk '/pixelWidth/ {print $2}')
    h=$(sips -g pixelHeight "$1" | awk '/pixelHeight/ {print $2}')
    s=$w; [ "$h" -lt "$s" ] && s=$h
    sips -s format png -c "$s" "$s" "$1" --out "$2" >/dev/null
    sips -Z ${SIZE} "$2" >/dev/null`, "sh", source, `${appHome()}/${rel}`]);
  if (r.code !== 0) throw new Error(r.stderr.trim() || "그림을 읽지 못했어요");
}

export async function setSpaceImage(spaceId, source) {
  const rel = `${DIR}/${spaceId}-${Date.now()}.png`;
  await cropSquare(source, rel);
  const old = spaceImage(spaceId);
  store(spaceId, rel);
  await removeFile(old);
}

// 내 프로필 사진.
export const profile = () => {
  const d = shared("slack.demo");
  return d ? { name: d.profile ?? "Jamie", image: null } : shared(PROFILE_KEY) ?? {}; // 데모 모드(demo.js)
};
export const setProfile = (patch) => setShared(PROFILE_KEY, { ...profile(), ...patch });

export async function setProfileImage(source) {
  const rel = `${DIR}/profile-${Date.now()}.png`;
  await cropSquare(source, rel);
  const old = profile().image;
  setProfile({ image: rel });
  await removeFile(old);
}

export async function clearProfileImage() {
  const old = profile().image;
  setProfile({ image: null });
  await removeFile(old);
}

// 워크스페이스 그림(레일 맨 위 타일).
export async function setWorkspaceImage(source) {
  const rel = `${DIR}/workspace-${Date.now()}.png`;
  await cropSquare(source, rel);
  const old = workspace().image;
  setWorkspace({ image: rel });
  await removeFile(old);
}

export async function clearWorkspaceImage() {
  const old = workspace().image;
  setWorkspace({ image: null });
  await removeFile(old);
}

export async function clearSpaceImage(spaceId) {
  const old = spaceImage(spaceId);
  store(spaceId, null);
  await removeFile(old);
}

// 시스템 파일 고르기(그림만). 취소하면 null.
export async function pickImage(prompt = "그림 고르기") {
  const r = await exec("osascript", ["-e",
    `POSIX path of (choose file with prompt "${prompt}" of type {"public.image"})`]);
  if (r.code !== 0) return null;
  return r.stdout.trim() || null;
}

const fail = (error) => notify({ title: "그림을 바꾸지 못했어요", body: String(error?.message ?? error), level: "error" });

// 레일(rail) copy 가 주기적으로 부른다: 팝업이 남긴 요청을 한 번만 처리한다.
export function handleImageRequest(state, cx) {
  const req = shared(SPACE_IMAGE_REQUEST_KEY);
  if (!req || req.at === state.imageRequestAt || state.imageBusy) return;
  state.imageRequestAt = req.at;
  setShared(SPACE_IMAGE_REQUEST_KEY, null);
  state.imageBusy = true;
  cx.spawn(async (cx) => {
    try {
      if (req.action === "clear") await clearSpaceImage(req.space);
      else if (req.action === "profile-clear") await clearProfileImage();
      else if (req.action === "workspace-clear") await clearWorkspaceImage();
      else {
        const file = await pickImage(req.action === "profile-pick" ? "프로필 사진 고르기" : "워크스페이스 그림 고르기");
        if (file && req.action === "profile-pick") await setProfileImage(file);
        else if (file && req.action === "workspace-pick") await setWorkspaceImage(file);
        else if (file) await setSpaceImage(req.space, file);
      }
    } catch (error) { fail(error); }
    state.imageBusy = false;
    cx.notify();
  });
}

// 그림 파일을 서버 아이콘에 끌어 놓았을 때.
export function dropImage(state, spaceId, paths, cx) {
  const file = (paths ?? []).find(isImagePath);
  if (!file || state.imageBusy) return;
  state.imageBusy = true;
  cx.spawn(async (cx) => {
    try { await setSpaceImage(spaceId, file); } catch (error) { fail(error); }
    state.imageBusy = false;
    cx.notify();
  });
}
