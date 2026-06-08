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
