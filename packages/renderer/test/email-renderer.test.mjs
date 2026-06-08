import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createEmailRenderer } from "../dist/index.js";

function createRenderer() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  return createEmailRenderer(dom.window);
}

test("renders plain text without interpreting HTML", async () => {
  const rendered = await createRenderer().render({
    mode: "plain-text",
    bodyText: "<script>alert('no')</script>\nHello"
  });

  assert.equal(rendered.content, "<script>alert('no')</script>\nHello");
  assert.equal(rendered.mode, "plain-text");
  assert.equal(rendered.remoteImagesBlocked, false);
});

test("sanitizes unsafe HTML and hardens external links", async () => {
  const rendered = await createRenderer().render({
    mode: "safe-html",
    bodyHtml: [
      "<p onclick=\"alert('no')\">Hello</p>",
      "<script>alert('no')</script>",
      "<a href=\"javascript:alert('no')\">unsafe</a>",
      "<a href=\"https://example.com/path\" ping=\"https://tracker.example.com\">safe</a>",
      "<iframe src=\"https://example.com\"></iframe>"
    ].join("")
  });

  assert.equal(rendered.content.includes("<script"), false);
  assert.equal(rendered.content.includes("onclick"), false);
  assert.equal(rendered.content.includes("javascript:"), false);
  assert.equal(rendered.content.includes("ping="), false);
  assert.equal(rendered.content.includes("<iframe"), false);
  assert.match(
    rendered.content,
    /href="https:\/\/example\.com\/path" target="_blank" rel="noopener noreferrer"/u
  );
  assert.deepEqual(rendered.externalLinkUrls, ["https://example.com/path"]);
});

test("blocks remote images and reports possible tracking pixels by default", async () => {
  const rendered = await createRenderer().render({
    mode: "safe-html",
    bodyHtml: [
      "<p>Before</p>",
      "<img src=\"https://tracker.example.com/open.gif\" width=\"1\" height=\"1\">",
      "<img src=\"/relative-image.png\">",
      "<img src=\"ftp://files.example.com/image.png\">",
      "<img src=\"cid:embedded-image\">",
      "<p>After</p>"
    ].join("")
  });

  assert.equal(rendered.remoteImagesBlocked, true);
  assert.deepEqual(rendered.remoteImageUrls, [
    "https://tracker.example.com/open.gif",
    "/relative-image.png",
    "ftp://files.example.com/image.png"
  ]);
  assert.equal(rendered.trackingPixelsDetected, 1);
  assert.equal(rendered.content.includes("https://tracker.example.com/open.gif"), false);
  assert.equal(rendered.content.includes("/relative-image.png"), false);
  assert.equal(rendered.content.includes("ftp://files.example.com/image.png"), false);
  assert.equal(rendered.content.includes("[Remote image blocked]"), true);
  assert.equal(rendered.content.includes("cid:embedded-image"), true);
});
