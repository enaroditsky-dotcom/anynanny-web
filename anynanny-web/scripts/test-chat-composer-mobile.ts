import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isNearScrollBottom } from "../lib/chat/composer-chrome";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const near = { scrollHeight: 400, scrollTop: 310, clientHeight: 80 } as HTMLElement;
const far = { scrollHeight: 400, scrollTop: 0, clientHeight: 80 } as HTMLElement;
assert.equal(isNearScrollBottom(near), true);
assert.equal(isNearScrollBottom(far), false);

const chat = read("components/chat/ChatInterface.tsx");
const inputStart = chat.indexOf("<input");
const inputEnd = chat.indexOf("placeholder=\"הקלד הודעה");
assert.ok(inputStart >= 0 && inputEnd > inputStart);
const inputBlock = chat.slice(inputStart, inputEnd);
assert.match(inputBlock, /text-\[16px\]/);
assert.doesNotMatch(inputBlock, /text-sm/);
assert.match(chat, /md:h-\[400px\]/);
assert.match(chat, /md:overflow-hidden/);
assert.doesNotMatch(chat, /(?<!md:)h-\[400px\]/);
assert.doesNotMatch(chat, /(?<!md:)overflow-hidden/);
assert.match(chat, /setChatComposerActive\(true\)/);
assert.match(chat, /setMountedChatConversation/);
assert.match(chat, /visualViewport/);
assert.match(chat, /behavior:\s*"auto"/);
assert.match(chat, /scrolling\.scrollTop = scrolling\.scrollHeight/);
assert.doesNotMatch(chat, /scrollIntoView\(\{\s*behavior:\s*"smooth"/);
assert.match(chat, /lifecycle\?\.closed/);
assert.match(chat, /closedHeadline/);
assert.match(chat, /env\(safe-area-inset-bottom/);
assert.match(chat, /scroll-mb-\[calc\(8rem\+var\(--anynanny-now-dock/);
assert.match(chat, /subscribePostgresChanges/);
assert.doesNotMatch(chat, /getChatLifecycle\s*=/);
assert.doesNotMatch(chat, /CHAT_GRACE_PERIOD/);

const nav = read("components/bottom-nav.tsx");
assert.match(nav, /CHAT_COMPOSER_ACTIVE_EVENT/);
assert.match(nav, /chatComposerActive \? `\$\{BOTTOM_NAV_SURFACE\} hidden`/);
assert.match(nav, /env\(safe-area-inset-bottom\)/);

const lifecycle = read("lib/chat/chat-lifecycle.ts");
assert.match(lifecycle, /CHAT_GRACE_PERIOD_MS = 24 \* 60 \* 60 \* 1000/);

const chrome = read("lib/chat/composer-chrome.ts");
assert.match(chrome, /8rem\+var\(--anynanny-now-dock/);
assert.match(chrome, /env\(safe-area-inset-bottom/);

console.log("chat composer mobile contract ok");
