import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publicAddress,
  verificationUrl,
  interpretPosting,
} from "../lib/tracker/verification";
test("verification rejects local, reserved, mapped, credential and unapproved targets", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "198.18.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
  ])
    assert.equal(publicAddress(address), false, address);
  assert(publicAddress("8.8.8.8"));
  assert(publicAddress("2606:4700:4700::1111"));
  for (const url of [
    "http://careers.example/job",
    "https://127.0.0.1/job",
    "https://user:password@careers.example/job",
    "https://careers.example:8080/job",
    "https://careers.example.evil.com/job",
  ])
    assert.throws(() => verificationUrl(url, ["careers.example"]));
  assert.equal(
    verificationUrl("https://careers.example/job", ["careers.example"])
      .hostname,
    "careers.example",
  );
});
test("posting classification needs authoritative evidence, never infers closure from transient failures", () => {
  const url = "https://careers.example/job";
  const expired =
    '<script type="application/ld+json">{"@type":"JobPosting","validThrough":"2026-01-01T00:00:00Z"}</script>';
  assert.equal(
    interpretPosting(200, expired, url, Date.parse("2026-10-22T00:00:00Z"))
      .availability,
    "closed",
  );
  assert.equal(
    interpretPosting(200, "<h1>This position has been filled</h1>", url)
      .availability,
    "closed",
  );
  for (const status of [401, 403, 404, 408, 410, 429, 500, 502, 503, 504])
    assert.equal(
      interpretPosting(status, expired, url).availability,
      "uncertain",
    );
  assert.equal(
    interpretPosting(200, "<title>Sign in</title>" + expired, url).availability,
    "uncertain",
  );
  assert.equal(
    interpretPosting(200, "<p>Some jobs may no longer be available.</p>", url)
      .availability,
    "uncertain",
  );
});
