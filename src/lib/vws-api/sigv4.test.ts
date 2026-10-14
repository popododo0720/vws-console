import { describe, expect, it } from "vitest";
import { signRequest } from "./sigv4";

const creds = { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY" };

describe("signRequest", () => {
  it("matches the published SigV4 example for IAM ListUsers", () => {
    const headers = signRequest(
      {
        method: "GET",
        url: new URL("https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08"),
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
        body: "",
        service: "iam",
        region: "us-east-1",
        now: new Date("2015-08-30T12:36:00Z"),
      },
      creds,
    );
    expect(headers).toEqual({
      "content-type": "application/x-www-form-urlencoded; charset=utf-8",
      "x-amz-date": "20150830T123600Z",
      authorization:
        "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/iam/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7",
    });
  });

  it("changes the signature when the body changes", () => {
    const base = {
      method: "POST",
      url: new URL("http://127.0.0.1:8081/"),
      headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
      service: "ec2",
      region: "vws-1",
      now: new Date("2026-10-14T00:00:00Z"),
    };
    const a = signRequest({ ...base, body: "Action=DescribeVpcs&Version=2016-11-15" }, creds).authorization;
    const b = signRequest({ ...base, body: "Action=DescribeVolumes&Version=2016-11-15" }, creds).authorization;
    expect(a).toContain("Credential=AKIDEXAMPLE/20261014/vws-1/ec2/aws4_request");
    expect(a).not.toBe(b);
  });
});
