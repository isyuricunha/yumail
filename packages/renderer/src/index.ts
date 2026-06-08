import createDOMPurify, { type Config, type WindowLike } from "dompurify";

export type RenderMode = "plain-text" | "safe-html";

export interface RenderEmailInput {
  mode: RenderMode;
  bodyText?: string;
  bodyHtml?: string;
  allowRemoteImages?: boolean;
}

export interface RenderedEmail {
  mode: RenderMode;
  content: string;
  plainTextLines?: PlainTextLine[];
  remoteImagesBlocked: boolean;
  remoteImageUrls: string[];
  externalLinkUrls: string[];
  trackingPixelsDetected: number;
}

export interface PlainTextLine {
  content: string;
  quoteDepth: number;
}

export interface EmailRenderer {
  render(input: RenderEmailInput): Promise<RenderedEmail>;
}

export const DEFAULT_RENDER_MODE: RenderMode = "safe-html";
export const REMOTE_IMAGES_BLOCKED_BY_DEFAULT = true;

const REMOTE_IMAGE_PLACEHOLDER = "[Remote image blocked]";
const TRACKING_URL_PATTERN = /(?:beacon|open(?:ed)?|pixel|track(?:ing)?)/iu;
const SANITIZER_OPTIONS: Config = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: [
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "option",
    "video",
    "audio",
    "source",
    "track",
    "map",
    "area",
    "link",
    "meta",
    "base",
    "svg",
    "math"
  ],
  FORBID_ATTR: [
    "style",
    "background",
    "poster",
    "formaction",
    "xlink:href",
    "ping",
    "usemap"
  ],
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  SANITIZE_DOM: true,
  SANITIZE_NAMED_PROPS: true
};

export function createPlainTextLines(content: string): PlainTextLine[] {
  return content.split(/\r\n|\n|\r/u).map((line) => ({
    content: line,
    quoteDepth: getPlainTextQuoteDepth(line)
  }));
}

export function createEmailRenderer(windowLike: WindowLike): EmailRenderer {
  const document = windowLike.document;

  if (!document) {
    throw new Error("Email rendering requires a DOM document.");
  }

  const purifier = createDOMPurify(windowLike);

  if (!purifier.isSupported) {
    throw new Error("DOMPurify is not supported by this rendering environment.");
  }

  return {
    async render(input) {
      if (input.mode === "plain-text") {
        const content = input.bodyText ?? "";

        return {
          mode: "plain-text",
          content,
          plainTextLines: createPlainTextLines(content),
          remoteImagesBlocked: false,
          remoteImageUrls: [],
          externalLinkUrls: [],
          trackingPixelsDetected: 0
        };
      }

      const sanitizedHtml = String(purifier.sanitize(input.bodyHtml ?? "", SANITIZER_OPTIONS));
      const sanitizedDocument = document.implementation.createHTMLDocument(
        "YuMail sanitized message"
      );
      sanitizedDocument.body.innerHTML = sanitizedHtml;

      const allowRemoteImages = input.allowRemoteImages ?? false;
      const remoteImageUrls = new Set<string>();
      let trackingPixelsDetected = 0;

      for (const image of sanitizedDocument.querySelectorAll("img")) {
        const source = image.getAttribute("src");
        const sourceSet = image.getAttribute("srcset");
        const remoteSources = [
          ...(source && isExternalImageSource(source) ? [source] : []),
          ...readRemoteSourceSetUrls(sourceSet)
        ];

        for (const remoteSource of remoteSources) {
          remoteImageUrls.add(remoteSource);
        }

        if (remoteSources.length > 0 && isTrackingImage(image, remoteSources)) {
          trackingPixelsDetected += 1;
        }

        image.removeAttribute("srcset");

        if (remoteSources.length === 0) {
          continue;
        }

        if (!allowRemoteImages) {
          image.replaceWith(sanitizedDocument.createTextNode(REMOTE_IMAGE_PLACEHOLDER));
          continue;
        }

        image.setAttribute("loading", "lazy");
        image.setAttribute("referrerpolicy", "no-referrer");
      }

      const externalLinkUrls = new Set<string>();

      for (const anchor of sanitizedDocument.querySelectorAll("a[href]")) {
        const href = anchor.getAttribute("href");

        if (!href || !isSafeLink(href)) {
          anchor.removeAttribute("href");
          anchor.removeAttribute("target");
          anchor.removeAttribute("rel");
          continue;
        }

        externalLinkUrls.add(href);
        anchor.setAttribute("target", "_blank");
        anchor.setAttribute("rel", "noopener noreferrer");
        anchor.setAttribute("referrerpolicy", "no-referrer");
      }

      return {
        mode: "safe-html",
        content: sanitizedDocument.body.innerHTML,
        remoteImagesBlocked: !allowRemoteImages && remoteImageUrls.size > 0,
        remoteImageUrls: [...remoteImageUrls],
        externalLinkUrls: [...externalLinkUrls],
        trackingPixelsDetected
      };
    }
  };
}

function getPlainTextQuoteDepth(line: string): number {
  const quotePrefix = line.match(/^\s*(?:>\s*)+/u)?.[0];
  return quotePrefix ? [...quotePrefix].filter((character) => character === ">").length : 0;
}

function isExternalImageSource(value: string): boolean {
  return !/^(?:cid:|data:)/iu.test(value.trim());
}

function readRemoteSourceSetUrls(sourceSet: string | null): string[] {
  if (!sourceSet) {
    return [];
  }

  return sourceSet
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/u)[0])
    .filter(
      (candidate): candidate is string => Boolean(
        candidate && isExternalImageSource(candidate)
      )
    );
}

function isTrackingImage(image: HTMLImageElement, remoteSources: string[]): boolean {
  const width = readPositiveNumber(image.getAttribute("width"));
  const height = readPositiveNumber(image.getAttribute("height"));
  const isTiny = (width !== undefined && width <= 1) || (height !== undefined && height <= 1);

  return isTiny || remoteSources.some((source) => TRACKING_URL_PATTERN.test(source));
}

function readPositiveNumber(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsedValue = Number.parseFloat(value);
  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : undefined;
}

function isSafeLink(value: string): boolean {
  const trimmedValue = value.trim();
  return (
    /^(?:https?:|mailto:)/iu.test(trimmedValue)
  );
}
