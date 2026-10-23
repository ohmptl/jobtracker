import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { integrationRequest } from "../lib/tracker/integration-diagnostics";

test("integration diagnostics include correlation and release without authentication material", async () => {
  const lines: string[] = [];
  const log = mock.method(console, "info", (message: string) => lines.push(message));
  try {
    const request = new Request("https://tracker.example/api/oauth/decision?code=secret-code&state=secret-state", {
      method: "POST",
      headers: { Authorization: "Bearer secret-token", Cookie: "session=secret-cookie" },
      body: "authorization_id=secret-id&client_secret=secret-client",
    });
    const response = integrationRequest(request, "/api/oauth/decision")(
      Response.redirect("https://chatgpt.com/connector/oauth/example?code=secret-code&state=secret-state", 303),
      "consent", "approved", { userId: "test-user", clientId: "test-client" },
    );
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-job-tracker-version"), "3.1.0");
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.request_id, response.headers.get("x-request-id"));
    assert.equal(entry.status, 303);
    assert.equal(entry.client_id, "test-client");
    assert(!lines.join().includes("secret-"));
    assert(!lines.join().includes("Authorization"));
    assert(!lines.join().includes("Cookie"));
    assert.equal(response.headers.get("location"), "https://chatgpt.com/connector/oauth/example?code=secret-code&state=secret-state");
  } finally { log.mock.restore(); }
});
