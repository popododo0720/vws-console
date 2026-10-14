import { createHash, createHmac } from "node:crypto";

export type Credentials = { accessKeyId: string; secretAccessKey: string };

export type SignInput = {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: string;
  service: string;
  region: string;
  now: Date;
};

function sha256Hex(data: string) {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function hmac(key: Buffer | string, data: string) {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function encode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalQuery(url: URL) {
  return [...url.searchParams]
    .map(([k, v]) => [encode(k), encode(v)] as const)
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

function amzDate(now: Date) {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Returns the headers to send: the input headers plus x-amz-date and
 * Authorization. Host and every header passed in are signed. Host is left out
 * of the result because fetch derives it from the URL.
 */
export function signRequest(input: SignInput, creds: Credentials): Record<string, string> {
  const date = amzDate(input.now);
  const payloadHash = sha256Hex(input.body);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.headers)) headers[k.toLowerCase()] = v.trim().replace(/\s+/g, " ");
  headers.host = input.url.host;
  headers["x-amz-date"] = date;
  const names = Object.keys(headers).sort();
  const canonical = [
    input.method,
    input.url.pathname.split("/").map(encode).join("/") || "/",
    canonicalQuery(input.url),
    names.map((n) => `${n}:${headers[n]}\n`).join(""),
    names.join(";"),
    payloadHash,
  ].join("\n");
  const scope = `${date.slice(0, 8)}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", date, scope, sha256Hex(canonical)].join("\n");
  const kDate = hmac(`AWS4${creds.secretAccessKey}`, date.slice(0, 8));
  const key = hmac(hmac(hmac(kDate, input.region), input.service), "aws4_request");
  const signature = createHmac("sha256", key).update(stringToSign, "utf8").digest("hex");
  delete headers.host;
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`;
  return headers;
}
