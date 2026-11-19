import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_SIDE_DRAWER_ID } from "../lib/navigation/app-side-drawer";
import { guardDrawerBackgroundClick } from "../lib/navigation/app-side-drawer-guard";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * At 335px the drawer is min(78vw, 340px) and anchored to the physical right.
 * The bottom nav is an LTR 5-column bar, so Wallet is the left column and sits
 * in the strip beside the drawer.
 */
const VIEWPORT = 335;
const drawerWidth = Math.min(VIEWPORT * 0.78, 340);
const walletColumnWidth = VIEWPORT / 5;
const walletCenter = walletColumnWidth / 2;
assert.ok(walletCenter < VIEWPORT - drawerWidth, "Wallet is exposed beside the drawer at 335px");

type ClickEvent = {
  target: Node;
  defaultPrevented: boolean;
  immediateStopped: boolean;
  preventDefault: () => void;
  stopImmediatePropagation: () => void;
};

type Listener = {
  capture: boolean;
  fn: (event: ClickEvent) => void;
};

class Node {
  parent: Node | null = null;
  id = "";
  controls = "";
  overlay = false;
  listeners: Listener[] = [];

  closest(selector: string): Node | null {
    let current: Node | null = this;
    while (current) {
      if (
        (selector === `#${APP_SIDE_DRAWER_ID}` && current.id === APP_SIDE_DRAWER_ID) ||
        (selector === `[aria-controls="${APP_SIDE_DRAWER_ID}"]` && current.controls === APP_SIDE_DRAWER_ID) ||
        (selector === "[data-product-tour-overlay]" && current.overlay)
      ) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  addEventListener(_type: string, fn: (event: ClickEvent) => void, capture?: boolean) {
    this.listeners.push({ capture: Boolean(capture), fn });
  }

  dispatch(event: ClickEvent) {
    const chain: Node[] = [];
    let current: Node | null = this;
    while (current) {
      chain.push(current);
      current = current.parent;
    }
    for (const node of [...chain].reverse()) {
      for (const listener of node.listeners) {
        if (!listener.capture) continue;
        listener.fn(event);
        if (event.immediateStopped) return;
      }
    }
    for (const node of chain) {
      for (const listener of node.listeners) {
        if (listener.capture) continue;
        listener.fn(event);
        if (event.immediateStopped) return;
      }
    }
  }
}

function clickEvent(target: Node): ClickEvent {
  const event: ClickEvent = {
    target,
    defaultPrevented: false,
    immediateStopped: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
    stopImmediatePropagation() {
      event.immediateStopped = true;
    }
  };
  return event;
}

/**
 * Same order as next/link: the caller's onClick runs, then navigation is
 * skipped when the event was already canceled.
 */
function installLink(node: Node, href: string, state: { url: string; badgeClears: number }, badge: boolean) {
  node.addEventListener("click", (event) => {
    if (badge) state.badgeClears += 1;
    if (event.defaultPrevented) return;
    state.url = href;
  });
}

function mount(role: "sitter" | "parent") {
  const windowNode = new Node();
  const drawer = new Node();
  drawer.id = APP_SIDE_DRAWER_ID;
  drawer.parent = windowNode;
  const drawerLink = new Node();
  drawerLink.parent = drawer;
  const menuButton = new Node();
  menuButton.controls = APP_SIDE_DRAWER_ID;
  menuButton.parent = windowNode;
  const wallet = new Node();
  wallet.parent = windowNode;
  const page = new Node();
  page.parent = windowNode;

  const href = role === "sitter" ? "/sitter/wallet" : "/parent/wallet";
  const home = role === "sitter" ? "/sitter/dashboard" : "/parent/dashboard";
  const state = { url: home, badgeClears: 0, open: true, menuToggles: 0, drawerNavigations: 0 };

  const installGuard = () => {
    windowNode.addEventListener(
      "click",
      (event) => {
        if (!state.open) return;
        guardDrawerBackgroundClick(event, false, () => {
          state.open = false;
        });
      },
      true
    );
  };
  installGuard();
  installLink(wallet, href, state, true);
  drawerLink.addEventListener("click", (event) => {
    if (!event.defaultPrevented) state.drawerNavigations += 1;
  });
  menuButton.addEventListener("click", (event) => {
    if (event.defaultPrevented) return;
    state.menuToggles += 1;
    state.open = !state.open;
  });

  return { windowNode, drawerLink, menuButton, wallet, page, state, href, home };
}

function tap(node: Node) {
  node.dispatch(clickEvent(node));
}

for (const role of ["sitter", "parent"] as const) {
  const unguarded = mount(role);
  unguarded.state.open = false;
  unguarded.windowNode.listeners.length = 0;
  installLink(unguarded.wallet, unguarded.href, unguarded.state, true);
  tap(unguarded.wallet);
  assert.equal(unguarded.state.url, unguarded.href, `${role} wallet navigates when the drawer is closed`);

  const session = mount(role);
  tap(session.wallet);
  assert.equal(session.state.open, false, `${role} drawer closes when the exposed wallet icon is tapped`);
  assert.equal(session.state.url, session.home, `${role} stays on the dashboard`);
  assert.equal(session.state.badgeClears, 0, `${role} wallet click does not reach the link`);

  session.windowNode.listeners.length = 0;
  tap(session.wallet);
  assert.equal(session.state.url, session.href, `${role} wallet navigates on a new tap after the drawer is closed`);

  const links = mount(role);
  tap(links.drawerLink);
  assert.equal(links.state.open, true, `${role} drawer stays open when its own link is used`);
  assert.equal(links.state.drawerNavigations, 1, `${role} drawer link still activates`);
  tap(links.menuButton);
  assert.equal(links.state.menuToggles, 1, `${role} hamburger still closes the drawer`);
  tap(links.page);
  assert.equal(links.state.url, links.home, `${role} page tap does not navigate`);
}

const hook = readFileSync(resolve(root, "components/navigation/use-app-side-drawer.ts"), "utf8");
const frame = readFileSync(resolve(root, "components/navigation/app-side-drawer-frame.tsx"), "utf8");
assert.match(hook, /addEventListener\("click", onBackgroundClick, true\)/);
assert.match(hook, /event\.key !== "Escape"/);
assert.match(hook, /menuButtonRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
assert.match(frame, /drawerActive \? "overflow-hidden overscroll-none" : "overflow-y-auto overscroll-y-contain"/);
assert.match(frame, /\[&_\*\]:!pointer-events-none/);

console.log("drawer background click: wallet tap closes without navigating");
