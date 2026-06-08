import type { AiActions } from "@yumail/ai";
import type { MailProvider } from "@yumail/mail";

export interface YuMailServices {
  mailProvider: MailProvider;
  aiActions?: AiActions;
}

export interface AppBootstrapState {
  productName: "YuMail";
  milestone: "foundation";
  aiManualByDefault: true;
  remoteImagesBlockedByDefault: true;
}

export function createFoundationBootstrapState(): AppBootstrapState {
  return {
    productName: "YuMail",
    milestone: "foundation",
    aiManualByDefault: true,
    remoteImagesBlockedByDefault: true
  };
}
