import assert from "node:assert/strict";
import test from "node:test";
import {
  JmapProvider,
  createJmapAuthorizationHeader,
  createJmapSessionUrlCandidates
} from "../dist/index.js";

const sessionResponse = {
  capabilities: {},
  accounts: {
    accountA: {
      name: "Primary",
      isPersonal: true,
      isReadOnly: false,
      accountCapabilities: {
        "urn:ietf:params:jmap:mail": {}
      }
    }
  },
  primaryAccounts: {
    "urn:ietf:params:jmap:mail": "accountA"
  },
  apiUrl: "https://mail.example.com/jmap/api"
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function createFetchMock() {
  return async (url, init) => {
    if (init?.method === "GET") {
      return jsonResponse(sessionResponse);
    }

    const request = JSON.parse(String(init?.body));
    const methodName = request.methodCalls?.[0]?.[0];
    const callId = request.methodCalls?.[0]?.[2];

    if (methodName === "Mailbox/get") {
      return jsonResponse({
        methodResponses: [
          [
            "Mailbox/get",
            {
              list: [
                {
                  id: "inbox-id",
                  name: "Inbox",
                  role: "inbox",
                  unreadEmails: 2,
                  totalEmails: 4
                }
              ]
            },
            "mailboxes"
          ]
        ]
      });
    }

    if (methodName === "Email/query") {
      return jsonResponse({
        methodResponses: [
          [
            "Email/query",
            {
              ids: ["email-1"],
              total: 1
            },
            "query"
          ]
        ]
      });
    }

    if (methodName === "Email/get") {
      if (callId === "message-detail") {
        return jsonResponse({
          methodResponses: [
            [
              "Email/get",
              {
                list: [
                  {
                    id: "email-1",
                    blobId: "message-blob",
                    mailboxIds: {
                      "inbox-id": true
                    },
                    threadId: "thread-1",
                    messageId: ["message@example.com"],
                    from: [{ name: "Ada", email: "ada@example.com" }],
                    to: [{ name: "Yu", email: "yu@example.com" }],
                    cc: [{ email: "team@example.com" }],
                    subject: "JMAP hello",
                    receivedAt: "2026-06-08T10:00:00.000Z",
                    preview: "Hello from JMAP",
                    keywords: {
                      "$seen": true,
                      "$answered": true
                    },
                    hasAttachment: true,
                    bodyStructure: {
                      partId: "root",
                      type: "multipart/mixed",
                      subParts: [
                        {
                          partId: "text",
                          blobId: "text-blob",
                          type: "text/plain",
                          charset: "utf-8",
                          size: 18
                        },
                        {
                          partId: "html",
                          blobId: "html-blob",
                          type: "text/html",
                          charset: "utf-8",
                          size: 31
                        },
                        {
                          partId: "attachment",
                          blobId: "attachment-blob",
                          type: "application/pdf",
                          name: "report.pdf",
                          disposition: "attachment",
                          size: 2048
                        }
                      ]
                    },
                    bodyValues: {
                      text: {
                        value: "Hello in plain text",
                        isTruncated: false
                      },
                      html: {
                        value: "<p>Hello in <strong>HTML</strong></p>",
                        isTruncated: false
                      }
                    },
                    textBody: [
                      {
                        partId: "text",
                        blobId: "text-blob",
                        type: "text/plain",
                        charset: "utf-8",
                        size: 18
                      }
                    ],
                    htmlBody: [
                      {
                        partId: "html",
                        blobId: "html-blob",
                        type: "text/html",
                        charset: "utf-8",
                        size: 31
                      }
                    ],
                    attachments: [
                      {
                        partId: "attachment",
                        blobId: "attachment-blob",
                        type: "application/pdf",
                        name: "report.pdf",
                        disposition: "attachment",
                        size: 2048
                      }
                    ]
                  }
                ]
              },
              "message-detail"
            ]
          ]
        });
      }

      return jsonResponse({
        methodResponses: [
          [
            "Email/get",
            {
              list: [
                {
                  id: "email-1",
                  mailboxIds: {
                    "inbox-id": true
                  },
                  threadId: "thread-1",
                  messageId: ["message@example.com"],
                  from: [{ name: "Ada", email: "ada@example.com" }],
                  to: [{ name: "Yu", email: "yu@example.com" }],
                  subject: "JMAP hello",
                  receivedAt: "2026-06-08T10:00:00.000Z",
                  preview: "Hello from JMAP",
                  keywords: {
                    "$seen": false,
                    "$flagged": true
                  },
                  hasAttachment: false
                }
              ]
            },
            "emails"
          ]
        ]
      });
    }

    throw new Error(`Unexpected JMAP method: ${methodName}`);
  };
}

test("creates JMAP session discovery candidates", () => {
  assert.deepEqual(createJmapSessionUrlCandidates("https://mail.example.com"), [
    "https://mail.example.com/.well-known/jmap",
    "https://mail.example.com/jmap/session"
  ]);
});

test("creates authorization headers for supported credential inputs", () => {
  assert.equal(createJmapAuthorizationHeader("Bearer abc", "yu@example.com"), "Bearer abc");
  assert.equal(createJmapAuthorizationHeader("user:secret", "yu@example.com"), `Basic ${btoa("user:secret")}`);
  assert.equal(createJmapAuthorizationHeader("password:secret", "yu@example.com"), `Basic ${btoa("yu@example.com:secret")}`);
});

test("discovers JMAP session, lists mailboxes, and normalizes inbox messages", async () => {
  const provider = new JmapProvider({
    localAccountId: "account:yu",
    emailAddress: "yu@example.com",
    baseUrl: "https://mail.example.com",
    authSecret: "Bearer token",
    fetch: createFetchMock()
  });

  const connection = await provider.discoverSession();
  const mailboxes = await provider.listMailboxes("account:yu");
  const messages = await provider.listMessages({
    accountId: "account:yu",
    mailboxId: mailboxes[0].id,
    page: { limit: 10 }
  });

  assert.equal(connection.jmapAccountId, "accountA");
  assert.equal(mailboxes[0].role, "inbox");
  assert.equal(mailboxes[0].providerMailboxId, "inbox-id");
  assert.equal(messages.items[0].subject, "JMAP hello");
  assert.equal(messages.items[0].from.address, "ada@example.com");
  assert.equal(messages.items[0].isRead, false);
  assert.equal(messages.items[0].isFlagged, true);
});

test("fetches and normalizes JMAP message detail body parts and attachments", async () => {
  const provider = new JmapProvider({
    localAccountId: "account:yu",
    emailAddress: "yu@example.com",
    baseUrl: "https://mail.example.com",
    authSecret: "Bearer token",
    fetch: createFetchMock()
  });

  const detail = await provider.getMessage({
    accountId: "account:yu",
    messageId: "account:yu:message:email-1",
    providerMessageId: "email-1",
    mailboxId: "account:yu:mailbox:inbox-id"
  });

  assert.equal(detail.providerMessageId, "email-1");
  assert.equal(detail.providerThreadId, "thread-1");
  assert.equal(detail.bodyText, "Hello in plain text");
  assert.equal(detail.bodyHtml, "<p>Hello in <strong>HTML</strong></p>");
  assert.equal(detail.bodyParts.length, 4);
  assert.equal(detail.bodyParts.find((part) => part.partId === "text")?.charset, "utf-8");
  assert.equal(detail.isRead, true);
  assert.equal(detail.isAnswered, true);
  assert.deepEqual(detail.attachments[0], {
    id: "account:yu:message:email-1:attachment:attachment-blob",
    messageId: "account:yu:message:email-1",
    providerAttachmentId: "attachment-blob",
    filename: "report.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    contentId: undefined
  });
});
