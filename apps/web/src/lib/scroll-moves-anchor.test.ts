import { test } from "node:test";
import assert from "node:assert/strict";
import { scrollMovesAnchor } from "./scroll-moves-anchor";

type FakeNode = { children: FakeNode[]; contains(n: FakeNode): boolean };

function node(...children: FakeNode[]): FakeNode {
  return {
    children,
    contains(n) {
      return n === this || this.children.some((c) => c.contains(n));
    },
  };
}

const scroll = (target: unknown) => ({ target }) as unknown as Event;

const trigger = node();
const header = node(trigger);
const chatBody = node();
const menu = node();
const doc = node(node(header, chatBody), menu);

test("a sibling scroller (streaming chat) does not move the anchor", () => {
  assert.equal(scrollMovesAnchor(scroll(chatBody), trigger as unknown as Node), false);
});

test("scrolling inside the portalled menu does not move the anchor", () => {
  assert.equal(scrollMovesAnchor(scroll(menu), trigger as unknown as Node), false);
});

test("page or ancestor scroll moves the anchor", () => {
  assert.equal(scrollMovesAnchor(scroll(doc), trigger as unknown as Node), true);
  assert.equal(scrollMovesAnchor(scroll(header), trigger as unknown as Node), true);
});

test("a missing anchor errs toward closing", () => {
  assert.equal(scrollMovesAnchor(scroll(chatBody), null), true);
});

test("a target without contains (window) does not move the anchor", () => {
  assert.equal(scrollMovesAnchor(scroll({}), trigger as unknown as Node), false);
});
