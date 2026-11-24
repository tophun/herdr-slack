// What the chat needs from the desktop it runs on, for macOS and Linux:
// the clipboard, the file picker, opening a file, and an image's size.
// Each tries the macOS tool first, then the Linux ones (Wayland, then X11).
import { exec } from "herdr";

const sh = (script, ...args) => exec("sh", ["-c", script, "sh", ...args]);

// Puts text on the clipboard; false when no clipboard tool is installed.
export async function copyText(text) {
  const r = await sh(`
    if command -v pbcopy >/dev/null 2>&1; then printf "%s" "$1" | pbcopy
    elif [ -n "$WAYLAND_DISPLAY" ] && command -v wl-copy >/dev/null 2>&1; then printf "%s" "$1" | wl-copy
    elif command -v xclip >/dev/null 2>&1; then printf "%s" "$1" | xclip -selection clipboard
    elif command -v xsel >/dev/null 2>&1; then printf "%s" "$1" | xsel --clipboard --input
    elif command -v wl-copy >/dev/null 2>&1; then printf "%s" "$1" | wl-copy
    elif q=$(command -v qdbus6 || command -v qdbus) && "$q" org.kde.klipper /klipper >/dev/null 2>&1; then "$q" org.kde.klipper /klipper setClipboardContents "$1"
    else exit 3; fi`, text);
  return r.code === 0;
}

// Puts an image file on the clipboard as PNG/TIFF; false on failure, "missing" when no tool is installed.
export async function copyImage(path) {
  const r = await sh(`
    if command -v osascript >/dev/null 2>&1; then
      osascript - "$1" >/dev/null 2>&1 <<'APPLESCRIPT'
use framework "AppKit"
use scripting additions
on run argv
  set img to current application's NSImage's alloc()'s initWithContentsOfFile:(item 1 of argv)
  if img is missing value then error "invalid image"
  set tiffData to img's TIFFRepresentation()
  set rep to current application's NSBitmapImageRep's imageRepWithData:tiffData
  set pngData to rep's representationUsingType:(current application's NSPNGFileType) |properties|:(missing value)
  set pb to current application's NSPasteboard's generalPasteboard()
  pb's clearContents()
  pb's setData:pngData forType:(current application's NSPasteboardTypePNG)
  pb's setData:tiffData forType:(current application's NSPasteboardTypeTIFF)
end run
APPLESCRIPT
    elif [ -n "$WAYLAND_DISPLAY" ] && command -v wl-copy >/dev/null 2>&1; then wl-copy --type image/png < "$1"
    elif command -v xclip >/dev/null 2>&1; then xclip -selection clipboard -t image/png -i "$1"
    elif command -v wl-copy >/dev/null 2>&1; then wl-copy --type image/png < "$1"
    else exit 3; fi`, path);
  return r.code === 3 ? "missing" : r.code === 0;
}

// Saves an image on the clipboard to `path` as PNG: true, false when there's
// none, or "missing" when this desktop has no tool to read it.
export async function pasteImage(path) {
  const r = await sh(`
    if command -v osascript >/dev/null 2>&1; then
      osascript - "$1" >/dev/null 2>&1 <<'APPLESCRIPT'
on run argv
  set imgData to the clipboard as «class PNGf»
  set f to open for access (POSIX file (item 1 of argv)) with write permission
  try
    set eof of f to 0
    write imgData to f
    close access f
  on error errMsg
    try
      close access f
    end try
    error errMsg
  end try
end run
APPLESCRIPT
    elif command -v wl-paste >/dev/null 2>&1 && wl-paste --list-types 2>/dev/null | grep -q '^image/png'; then wl-paste --type image/png > "$1"
    elif command -v xclip >/dev/null 2>&1; then xclip -selection clipboard -t image/png -o > "$1" 2>/dev/null
    else exit 3; fi
    if [ -s "$1" ]; then exit 0; else rm -f "$1"; exit 1; fi`, path);
  return r.code === 3 ? "missing" : r.code === 0;
}

// Opens a file in the desktop's default app (an image in Preview, say).
export function openFile(path) {
  return sh(`if command -v open >/dev/null 2>&1 && [ "$(uname)" = Darwin ]; then open "$1"; else xdg-open "$1" >/dev/null 2>&1 & fi`, path);
}

// The system's file picker, several files at once: their paths, [] when
// cancelled, or null when this desktop has no picker the chat can use.
export async function pickFiles(prompt = "Attach to your message") {
  const r = await sh(`
    if command -v osascript >/dev/null 2>&1; then
      osascript - "$1" <<'APPLESCRIPT'
on run argv
  set fs to choose file with prompt (item 1 of argv) with multiple selections allowed
  set out to ""
  repeat with f in fs
    set out to out & POSIX path of f & linefeed
  end repeat
  return out
end run
APPLESCRIPT
    elif command -v kdialog >/dev/null 2>&1; then kdialog --title "$1" --getopenfilename "$HOME" --multiple --separate-output
    elif command -v zenity >/dev/null 2>&1; then zenity --file-selection --multiple --separator="
" --title="$1"
    elif command -v yad >/dev/null 2>&1; then yad --file --multiple --separator="
" --title="$1"
    else exit 3; fi; true`, prompt);
  if (r.code === 3) return null;
  return r.stdout.split("\n").map((l) => l.replace(/\r$/, "")).filter(Boolean);
}

export { imageSize } from "./image-size.js";
