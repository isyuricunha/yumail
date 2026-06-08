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
        "urn:ietf:params:jmap:mail": {},
        "urn:ietf:params:jmap:submission": {}
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

function createSendFetchMock(requestLog, failureType, cleanupFailureType) {
  return async (_url, init) => {
    if (init?.method === "GET") {
      return jsonResponse(sessionResponse);
    }

    const request = JSON.parse(String(init?.body));
    requestLog.push(request);
    const methodNames = request.methodCalls.map((methodCall) => methodCall[0]);
    const callIds = request.methodCalls.map((methodCall) => methodCall[2]);

    if (callIds.includes("cleanup-failed-outgoing-email")) {
      return jsonResponse({
        methodResponses: [
          [
            "Email/set",
            cleanupFailureType
              ? {
                notDestroyed: {
                  "sent-email-1": {
                    type: "forbidden",
                    description: "Cleanup rejected."
                  }
                }
              }
              : {
                destroyed: ["sent-email-1"]
              },
            "cleanup-failed-outgoing-email"
          ]
        ]
      });
    }

    if (methodNames.includes("Identity/get")) {
      return jsonResponse({
        methodResponses: [
          [
            "Identity/get",
            {
              list: [
                {
                  id: "identity-1",
                  name: "Yu",
                  email: "yu@example.com"
                }
              ]
            },
            "send-identities"
          ],
          [
            "Mailbox/get",
            {
              list: [
                {
                  id: "drafts/id",
                  name: "Drafts",
                  role: "drafts"
                },
                {
                  id: "sent/id",
                  name: "Sent",
                  role: "sent"
                }
              ]
            },
            "send-mailboxes"
          ]
        ]
      });
    }

    if (methodNames.includes("EmailSubmission/set")) {
      return jsonResponse({
        methodResponses: [
          [
            "Email/set",
            failureType === "email"
              ? {
                notCreated: {
                  "yumail-email": {
                    type: "invalidProperties",
                    description: "Invalid outgoing email."
                  }
                }
              }
              : {
                created: {
                  "yumail-email": {
                    id: "sent-email-1",
                    threadId: "thread-1"
                  }
                }
              },
            "create-outgoing-email"
          ],
          [
            "EmailSubmission/set",
            failureType === "submission"
              ? {
                notCreated: {
                  "yumail-submission": {
                    type: "forbiddenToSend",
                    description: "Submission rejected."
                  }
                }
              }
              : {
                created: {
                  "yumail-submission": {
                    id: "submission-1",
                    emailId: "sent-email-1",
                    threadId: "thread-1",
                    sendAt: "2026-06-08T14:00:00.000Z"
                  }
                }
              },
            "submit-outgoing-email"
          ]
        ]
      });
    }

    throw new Error(`Unexpected JMAP methods: ${methodNames.join(", ")}`);
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

test("creates and manually submits a JMAP email with reply metadata", async () => {
  const requestLog = [];
  const provider = new JmapProvider({
    localAccountId: "account:yu",
    emailAddress: "yu@example.com",
    baseUrl: "https://mail.example.com",
    authSecret: "Bearer token",
    jmapAccountId: "accountA",
    fetch: createSendFetchMock(requestLog)
  });

  const result = await provider.replyMessage({
    accountId: "account:yu",
    from: { name: "Yu", address: "yu@example.com" },
    to: [{ name: "Ada", address: "ada@example.com" }],
    cc: [{ address: "team@example.com" }],
    bcc: [{ address: "audit@example.com" }],
    subject: "Re: JMAP hello",
    bodyText: "Thanks for the update.",
    replyTo: {
      messageId: "account:yu:message:email-1",
      providerMessageId: "email-1",
      providerThreadId: "thread-1",
      messageIdHeader: "message@example.com",
      references: ["root@example.com"]
    }
  });

  const sendRequest = requestLog[1];
  const emailSet = sendRequest.methodCalls[0][1];
  const submissionSet = sendRequest.methodCalls[1][1];
  const outgoingEmail = emailSet.create["yumail-email"];

  assert.deepEqual(sendRequest.using, [
    "urn:ietf:params:jmap:core",
    "urn:ietf:params:jmap:mail",
    "urn:ietf:params:jmap:submission"
  ]);
  assert.deepEqual(outgoingEmail.mailboxIds, { "drafts/id": true });
  assert.deepEqual(outgoingEmail.keywords, { "$draft": true, "$seen": true });
  assert.deepEqual(outgoingEmail.from, [{ name: "Yu", email: "yu@example.com" }]);
  assert.deepEqual(outgoingEmail.to, [{ name: "Ada", email: "ada@example.com" }]);
  assert.deepEqual(outgoingEmail.cc, [{ email: "team@example.com" }]);
  assert.deepEqual(outgoingEmail.bcc, [{ email: "audit@example.com" }]);
  assert.deepEqual(outgoingEmail.inReplyTo, ["message@example.com"]);
  assert.deepEqual(outgoingEmail.references, [
    "root@example.com",
    "message@example.com"
  ]);
  assert.deepEqual(outgoingEmail.textBody, [{
    partId: "yumail-text",
    type: "text/plain"
  }]);
  assert.equal(outgoingEmail.bodyValues["yumail-text"].value, "Thanks for the update.");
  assert.deepEqual(submissionSet.create["yumail-submission"], {
    identityId: "identity-1",
    emailId: "#yumail-email"
  });
  assert.deepEqual(submissionSet.onSuccessUpdateEmail["#yumail-submission"], {
    "keywords/$draft": null,
    "mailboxIds/sent~1id": true,
    "mailboxIds/drafts~1id": null
  });
  assert.deepEqual(result, {
    status: "sent",
    sent: true,
    failed: false,
    cleanupAttempted: false,
    cleanupSucceeded: false,
    serverDraftMayRemain: false,
    providerMessageId: "sent-email-1",
    providerSubmissionId: "submission-1",
    submissionId: "submission-1",
    providerThreadId: "thread-1",
    messageId: "account:yu:message:sent-email-1",
    sentAt: "2026-06-08T14:00:00.000Z"
  });
});

test("cleans up the temporary Email when JMAP submission fails after Email creation", async () => {
  const requestLog = [];
  const provider = new JmapProvider({
    localAccountId: "account:yu",
    emailAddress: "yu@example.com",
    baseUrl: "https://mail.example.com",
    authSecret: "Bearer token",
    fetch: createSendFetchMock(requestLog, "submission")
  });

  const result = await provider.sendMessage({
    accountId: "account:yu",
    from: { address: "yu@example.com" },
    to: [{ address: "ada@example.com" }],
    subject: "Hello",
    bodyText: "Manual send"
  });
  const cleanupRequest = requestLog[2];

  assert.deepEqual(
    cleanupRequest.methodCalls.map((methodCall) => methodCall[0]),
    ["Email/set"]
  );
  assert.deepEqual(cleanupRequest.methodCalls[0][1].destroy, ["sent-email-1"]);
  assert.equal(result.status, "failed");
  assert.equal(result.sent, false);
  assert.equal(result.failed, true);
  assert.equal(result.cleanupAttempted, true);
  assert.equal(result.cleanupSucceeded, true);
  assert.equal(result.serverDraftMayRemain, false);
  assert.equal(result.providerMessageId, "sent-email-1");
  assert.equal(result.errorCode, "jmap_submission_failed");
  assert.match(result.errorMessage, /Submission rejected/u);
});

test("warns when failed submission cleanup does not remove the server draft", async () => {
  const requestLog = [];
  const provider = new JmapProvider({
    localAccountId: "account:yu",
    emailAddress: "yu@example.com",
    baseUrl: "https://mail.example.com",
    authSecret: "Bearer token",
    fetch: createSendFetchMock(requestLog, "submission", "cleanup")
  });

  const result = await provider.sendMessage({
    accountId: "account:yu",
    from: { address: "yu@example.com" },
    to: [{ address: "ada@example.com" }],
    subject: "Hello",
    bodyText: "Manual send"
  });

  assert.equal(requestLog.length, 3);
  assert.equal(result.status, "failed");
  assert.equal(result.cleanupAttempted, true);
  assert.equal(result.cleanupSucceeded, false);
  assert.equal(result.serverDraftMayRemain, true);
  assert.match(result.cleanupErrorMessage, /Cleanup rejected/u);
});

test("rejects sending when the account lacks JMAP submission support", async () => {
  const provider = new JmapProvider({
    localAccountId: "account:yu",
    emailAddress: "yu@example.com",
    baseUrl: "https://mail.example.com",
    authSecret: "Bearer token",
    fetch: async (_url, init) => {
      if (init?.method !== "GET") {
        throw new Error("The provider must reject before issuing JMAP method calls.");
      }

      return jsonResponse({
        ...sessionResponse,
        accounts: {
          accountA: {
            ...sessionResponse.accounts.accountA,
            accountCapabilities: {
              "urn:ietf:params:jmap:mail": {}
            }
          }
        }
      });
    }
  });

  await assert.rejects(
    provider.sendMessage({
      accountId: "account:yu",
      from: { address: "yu@example.com" },
      to: [{ address: "ada@example.com" }],
      subject: "Hello",
      bodyText: "Manual send"
    }),
    (error) => {
      assert.equal(error.code, "jmap_submission_not_supported");
      return true;
    }
  );
});

test("normalizes JMAP outgoing email creation failures into a send result", async () => {
  const provider = new JmapProvider({
    localAccountId: "account:yu",
    emailAddress: "yu@example.com",
    baseUrl: "https://mail.example.com",
    authSecret: "Bearer token",
    fetch: createSendFetchMock([], "email")
  });

  const result = await provider.sendMessage({
    accountId: "account:yu",
    from: { address: "yu@example.com" },
    to: [{ address: "ada@example.com" }],
    subject: "Hello",
    bodyText: "Manual send"
  });

  assert.equal(result.status, "failed");
  assert.equal(result.sent, false);
  assert.equal(result.failed, true);
  assert.equal(result.cleanupAttempted, false);
  assert.equal(result.serverDraftMayRemain, false);
  assert.equal(result.errorCode, "jmap_email_create_failed");
  assert.match(result.errorMessage, /Invalid outgoing email/u);
});
