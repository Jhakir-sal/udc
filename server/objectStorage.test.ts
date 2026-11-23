import assert from "node:assert/strict";
import test from "node:test";
import { PassThrough, Readable } from "node:stream";
import type { Response } from "express";
import type { BlobClient } from "@azure/storage-blob";
import { ObjectStorageService, parseByteRange } from "./integrations/object-storage/objectStorage";

test("normalizes Azure and Azurite upload URLs to the stored object path", () => {
  const previousContainer = process.env.AZURE_STORAGE_PRIVATE_CONTAINER;
  process.env.AZURE_STORAGE_PRIVATE_CONTAINER = "private-files";
  try {
    const objects = new ObjectStorageService();
    assert.equal(
      objects.normalizeObjectEntityPath(
        "https://account.blob.core.windows.net/private-files/uploads/file-id?sv=token",
      ),
      "/objects/uploads/file-id",
    );
    assert.equal(
      objects.normalizeObjectEntityPath(
        "http://127.0.0.1:10000/devstoreaccount1/private-files/uploads/file-id?sig=token",
      ),
      "/objects/uploads/file-id",
    );
    assert.equal(
      objects.normalizeObjectEntityPath("https://account.blob.core.windows.net/other/file-id?sig=token"),
      "/other/file-id",
    );
  } finally {
    if (previousContainer === undefined) delete process.env.AZURE_STORAGE_PRIVATE_CONTAINER;
    else process.env.AZURE_STORAGE_PRIVATE_CONTAINER = previousContainer;
  }
});

test("parses standard, open-ended, suffix, and clamped byte ranges", () => {
  assert.deepEqual(parseByteRange("bytes=2-4", 10), { start: 2, end: 4 });
  assert.deepEqual(parseByteRange("bytes=8-", 10), { start: 8, end: 9 });
  assert.deepEqual(parseByteRange("bytes=-3", 10), { start: 7, end: 9 });
  assert.deepEqual(parseByteRange("bytes=8-20", 10), { start: 8, end: 9 });
});

test("rejects malformed, empty, and unsatisfiable byte ranges", () => {
  assert.equal(parseByteRange("bytes=1-2,4-5", 10), null);
  assert.equal(parseByteRange("bytes=-0", 10), null);
  assert.equal(parseByteRange("bytes=10-", 10), null);
  assert.equal(parseByteRange("bytes=0-1", 0), null);
});

test("serves a valid byte range as a partial response", async () => {
  const contents = Buffer.from("0123456789");
  let downloadRange: [number | undefined, number | undefined] | undefined;
  const blob = {
    name: "uploads/file-id",
    async getProperties() {
      return {
        contentLength: contents.length,
        contentType: "audio/mpeg",
        metadata: { aclpolicy: JSON.stringify({ owner: "owner", visibility: "private" }) },
      };
    },
    async download(offset?: number, count?: number) {
      downloadRange = [offset, count];
      return { readableStreamBody: Readable.from([contents.subarray(offset, (offset ?? 0) + (count ?? contents.length))]) };
    },
  } as unknown as BlobClient;

  const stream = new PassThrough();
  let statusCode = 200;
  const headers: Record<string, string> = {};
  const response = Object.assign(stream, {
    status(code: number) {
      statusCode = code;
      return this;
    },
    set(field: string | Record<string, string>, value?: string) {
      if (typeof field === "string") headers[field.toLowerCase()] = value || "";
      else for (const [key, headerValue] of Object.entries(field)) headers[key.toLowerCase()] = headerValue;
      return this;
    },
  }) as unknown as Response;
  const received: Buffer[] = [];
  stream.on("data", (chunk: Buffer) => received.push(chunk));
  const finished = new Promise<void>((resolve) => stream.once("finish", resolve));

  await new ObjectStorageService().downloadObject(blob, response, 60, "bytes=2-5");
  await finished;

  assert.equal(statusCode, 206);
  assert.deepEqual(downloadRange, [2, 4]);
  assert.equal(headers["content-range"], "bytes 2-5/10");
  assert.equal(headers["content-length"], "4");
  assert.equal(Buffer.concat(received).toString(), "2345");
});
