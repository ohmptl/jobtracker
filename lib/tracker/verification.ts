import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "node:https";

export function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 168].includes(b)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && [18, 19, 51].includes(b)) ||
      (a === 203 && b === 0)
    );
  }
  // Only globally routed IPv6 unicast. Excludes mapped IPv4, local, loopback,
  // link-local, multicast, NAT64 and documentation addresses.
  const parts = address.toLowerCase().split(":");
  return (
    isIP(address) === 6 &&
    /^[23][0-9a-f]{3}:/i.test(address) &&
    !(
      parts[0] === "2001" &&
      (parseInt(parts[1] || "0", 16) < 0x200 || parts[1] === "db8")
    ) &&
    !/^2002:/i.test(address)
  );
}
export function verificationUrl(raw: string, hosts: string[]) {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    isIP(url.hostname) ||
    !hosts.includes(url.hostname.toLowerCase())
  )
    throw new Error(
      "Verification URL is not an approved employer/ATS HTTPS host",
    );
  return url;
}
export type Verification = {
  availability: "open" | "closed" | "uncertain";
  confidence: "high" | "medium" | "low";
  method:
    | "employer_explicit"
    | "ats_explicit"
    | "http"
    | "timeout"
    | "blocked"
    | "login_required";
  source: string;
  evidence: string;
  http_status?: number;
};
export function interpretPosting(
  status: number,
  html: string,
  source: string,
  now = Date.now(),
): Verification {
  const base: Verification = {
    availability: "uncertain",
    confidence: "low",
    method: "http",
    source,
    evidence: `HTTP ${status}; no authoritative posting lifecycle evidence.`,
    http_status: status,
  };
  if ([401, 403, 408, 429].includes(status) || status >= 500)
    return {
      ...base,
      method:
        status === 401 ? "login_required" : status === 403 ? "blocked" : "http",
    };
  if (status !== 200) return base;
  if (
    /<title[^>]*>[^<]*(sign in|log in|access denied|just a moment|captcha)/i.test(
      html,
    )
  )
    return { ...base, method: "blocked" };
  for (const match of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const root = JSON.parse(match[1]);
      const nodes = Array.isArray(root) ? root : root["@graph"] || [root];
      for (const node of nodes) {
        if (
          !(
            node["@type"] === "JobPosting" ||
            node["@type"]?.includes?.("JobPosting")
          )
        )
          continue;
        const expires =
          typeof node.validThrough === "string"
            ? Date.parse(node.validThrough)
            : NaN;
        if (Number.isFinite(expires))
          return {
            availability: expires <= now ? "closed" : "open",
            confidence: "high",
            method: "employer_explicit",
            source,
            http_status: status,
            evidence: `Employer JobPosting structured data validThrough=${node.validThrough}; checked against UTC timestamp.`,
          };
      }
    } catch {
      /* Broken page metadata is uncertain, never closed. */
    }
  }
  const heading =
    /<(?:h1|h2)[^>]*>\s*(?:<[^>]+>\s*)*(this (?:job|position) is no longer available|(?:this )?position has been filled|(?:this )?job posting has expired)\s*[.!]?\s*(?:<\/[^>]+>\s*)*<\/(?:h1|h2)>/i.exec(
      html,
    );
  if (heading)
    return {
      ...base,
      availability: "closed",
      confidence: "high",
      method: "employer_explicit",
      evidence: `Employer page explicitly states in its heading: ${heading[1]}.`,
    };
  return base;
}

// Resolve every hop and pin the connection to a validated DNS result. TLS still
// verifies the original hostname. No ambient cookies, proxy headers or credentials.
export async function fetchPosting(
  raw: string,
  hosts: string[],
  redirects = 0,
): Promise<Verification> {
  const url = verificationUrl(raw, hosts);
  const addresses = await new Promise<Awaited<ReturnType<typeof lookup>>[]>(
    (resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Verification DNS lookup timed out")),
        3000,
      );
      lookup(url.hostname, { all: true, verbatim: true }).then(
        (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    },
  );
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error("Verification DNS resolves to a restricted network");
  const pinned = addresses[0];
  const response = await new Promise<{
    status: number;
    body: string;
    location?: string;
  }>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": "JobTracker-PostingVerification/2.0",
          Accept: "text/html,application/ld+json",
          "Accept-Encoding": "identity",
        },
        lookup: ((
          _hostname: unknown,
          _options: unknown,
          callback: (
            error: Error | null,
            address: string,
            family: number,
          ) => void,
        ) => callback(null, pinned.address, pinned.family)) as NonNullable<
          import("node:https").RequestOptions["lookup"]
        >,
        family: pinned.family,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 262144) {
            req.destroy(new Error("Posting exceeded 256 KiB"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf8"),
            location: res.headers.location,
          }),
        );
        res.on("error", reject);
      },
    );
    req.setTimeout(5000, () =>
      req.destroy(new Error("Posting request timed out")),
    );
    const deadline = setTimeout(
      () => req.destroy(new Error("Posting request timed out")),
      8000,
    );
    req.on("close", () => clearTimeout(deadline));
    req.on("error", reject);
    req.end();
  });
  if (
    [301, 302, 303, 307, 308].includes(response.status) &&
    response.location
  ) {
    if (redirects >= 2) throw new Error("Posting redirect limit exceeded");
    return fetchPosting(
      new URL(response.location, url).toString(),
      hosts,
      redirects + 1,
    );
  }
  return interpretPosting(response.status, response.body, url.toString());
}
