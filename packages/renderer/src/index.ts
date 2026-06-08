export type RenderMode = "plain-text" | "safe-html";

export interface RenderEmailInput {
  mode: RenderMode;
  bodyText?: string;
  bodyHtml?: string;
  allowRemoteImages: boolean;
}

export interface RenderedEmail {
  mode: RenderMode;
  content: string;
  remoteImagesBlocked: boolean;
  trackingPixelsDetected: number;
}

export interface EmailRenderer {
  render(input: RenderEmailInput): Promise<RenderedEmail>;
}

export const DEFAULT_RENDER_MODE: RenderMode = "safe-html";
export const REMOTE_IMAGES_BLOCKED_BY_DEFAULT = true;
