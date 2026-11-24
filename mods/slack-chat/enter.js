// From Flockbook (github.com/minchenlee/flockbook, mods/flockbook/composer.js), MIT License,
// Copyright (c) 2026 Minchen Lee — see bin/LICENSE-flockbook.
//
// Enter in the box puts a new line at the cursor (over a selection) before it reports the submit, so in the
// middle of the text that line went out. `before` is the text just before the key: when `now` is `before` with
// one span turned into "\n", the text to send is `before`. Anything else is sent as it is.
export function withoutEnter(now, before) {
  if (typeof before !== "string" || now === before) return now;
  let i = 0;
  while (i < now.length && i < before.length && now[i] === before[i]) i++;
  let j = 0;
  while (j < now.length - i && j < before.length - i && now[now.length - 1 - j] === before[before.length - 1 - j]) j++;
  return now.slice(i, now.length - j) === "\n" ? before : now;
}
