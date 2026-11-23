import { DefaultAzureCredential } from "@azure/identity";
import {
  BlobClient,
  BlobSASPermissions,
  BlobServiceClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { randomUUID } from "crypto";
import { Response } from "express";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

const PRIVATE_CONTAINER_DEFAULT = "private";
const PUBLIC_CONTAINER_DEFAULT = "public";
const UPLOAD_URL_TTL_SECONDS = 900;

let blobServiceClient: BlobServiceClient | undefined;

function getBlobServiceClient(): BlobServiceClient {
  if (blobServiceClient) return blobServiceClient;

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
  if (connectionString) {
    blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    return blobServiceClient;
  }

  const accountUrl = process.env.AZURE_STORAGE_ACCOUNT_URL?.trim();
  if (!accountUrl) {
    throw new Error(
      "Configure AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_URL for Azure Blob Storage.",
    );
  }

  blobServiceClient = new BlobServiceClient(accountUrl, new DefaultAzureCredential());
  return blobServiceClient;
}

function getContainerName(variable: string, defaultName: string): string {
  const name = process.env[variable]?.trim().toLowerCase() || defaultName;
  if (
    name.length < 3 ||
    name.length > 63 ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name) ||
    name.includes("--")
  ) {
    throw new Error(`${variable} must be a valid Azure Blob container name.`);
  }
  return name;
}

function parseByteRange(rangeHeader: string, totalSize: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match || !Number.isSafeInteger(totalSize) || totalSize <= 0 || (!match[1] && !match[2])) return null;

  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(totalSize - suffixLength, 0);
    end = totalSize - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : totalSize - 1;
  }

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= totalSize || end < start) {
    return null;
  }
  return { start, end: Math.min(end, totalSize - 1) };
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  getPublicObjectSearchPaths(): string[] {
    const paths = (process.env.AZURE_STORAGE_PUBLIC_SEARCH_PATHS || "")
      .split(",")
      .map((path) => path.trim().replace(/^\/+|\/+$/g, ""))
      .filter(Boolean);
    return paths.length ? Array.from(new Set(paths)) : [""];
  }

  getPrivateObjectDir(): string {
    return getContainerName("AZURE_STORAGE_PRIVATE_CONTAINER", PRIVATE_CONTAINER_DEFAULT);
  }

  async searchPublicObject(filePath: string): Promise<BlobClient | null> {
    const container = getBlobServiceClient().getContainerClient(
      getContainerName("AZURE_STORAGE_PUBLIC_CONTAINER", PUBLIC_CONTAINER_DEFAULT),
    );
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const blobName = [searchPath, filePath].filter(Boolean).join("/");
      const blob = container.getBlobClient(blobName);
      if (await blob.exists()) return blob;
    }
    return null;
  }

  async downloadObject(
    file: BlobClient,
    res: Response,
    cacheTtlSec: number = 3600,
    rangeHeader?: string,
  ): Promise<void> {
    try {
      const metadata = await file.getProperties();
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";
      const totalSize = Number(metadata.contentLength);
      const range = rangeHeader ? parseByteRange(rangeHeader, totalSize) : null;

      if (rangeHeader && !range) {
        res.status(416).set("Content-Range", `bytes */${totalSize}`).end();
        return;
      }

      if (range) {
        res.status(206).set({
          "Content-Range": `bytes ${range.start}-${range.end}/${totalSize}`,
          "Content-Length": String(range.end - range.start + 1),
        });
      }
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        ...(range ? {} : { "Content-Length": String(metadata.contentLength) }),
        "Accept-Ranges": "bytes",
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
        ...(isPublic ? {} : { "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff" }),
      });

      const download = await file.download(
        range?.start,
        range ? range.end - range.start + 1 : undefined,
      );
      if (!download.readableStreamBody) throw new Error("Azure Blob download did not return a readable stream.");
      download.readableStreamBody.on("error", (error) => {
        console.error("Stream error:", error);
        if (!res.headersSent) res.status(500).json({ error: "Error streaming file" });
      });
      download.readableStreamBody.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) res.status(500).json({ error: "Error downloading file" });
    }
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const containerName = this.getPrivateObjectDir();
    const objectName = `uploads/${randomUUID()}`;
    const blob = getBlobServiceClient().getContainerClient(containerName).getBlobClient(objectName);
    const startsOn = new Date(Date.now() - 5 * 60 * 1000);
    const expiresOn = new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000);
    const options = {
      permissions: BlobSASPermissions.parse("cw"),
      startsOn,
      expiresOn,
    };

    const serviceClient = getBlobServiceClient();
    if (serviceClient.credential instanceof StorageSharedKeyCredential) {
      return blob.generateSasUrl(options);
    }
    if (process.env.AZURE_STORAGE_CONNECTION_STRING?.trim()) {
      throw new Error(
        "Upload SAS generation requires an account-key connection string or AZURE_STORAGE_ACCOUNT_URL with a credential that can request a user-delegation key.",
      );
    }

    const delegationKey = await serviceClient.getUserDelegationKey(startsOn, expiresOn);
    return blob.generateUserDelegationSasUrl(options, delegationKey);
  }

  async getObjectEntityFile(objectPath: string): Promise<BlobClient> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();

    const blobName = objectPath.slice("/objects/".length);
    if (!blobName || blobName.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new ObjectNotFoundError();
    }

    const blob = getBlobServiceClient()
      .getContainerClient(this.getPrivateObjectDir())
      .getBlobClient(blobName);
    if (!(await blob.exists())) throw new ObjectNotFoundError();
    return blob;
  }

  async deleteObjectEntity(objectPath: string): Promise<void> {
    try {
      const file = await this.getObjectEntityFile(objectPath);
      await file.deleteIfExists();
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) throw error;
    }
  }

  allocatePrivateObjectEntityPath(directory: string): string {
    if (!/^[a-z0-9-]+$/.test(directory)) throw new Error("Invalid private object directory");
    return `/objects/${directory}/${randomUUID()}`;
  }

  async writeObjectEntity(destinationObjectPath: string, data: Buffer, contentType: string): Promise<void> {
    if (!destinationObjectPath.startsWith("/objects/")) throw new Error("Invalid destination object path");
    const blobName = destinationObjectPath.slice("/objects/".length);
    if (!blobName || blobName.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new Error("Invalid destination object path");
    }

    const blob = getBlobServiceClient()
      .getContainerClient(this.getPrivateObjectDir())
      .getBlockBlobClient(blobName);
    await blob.uploadData(data, {
      blobHTTPHeaders: {
        blobContentType: contentType,
        blobCacheControl: "private, no-store",
      },
    });
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!/^https?:\/\//i.test(rawPath)) return rawPath;

    const url = new URL(rawPath);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const containerName = this.getPrivateObjectDir();
    const containerIndex = pathParts[0] === containerName
      ? 0
      : pathParts[1] === containerName
        ? 1
        : -1;
    if (containerIndex < 0 || containerIndex === pathParts.length - 1) return url.pathname;
    return `/objects/${pathParts.slice(containerIndex + 1).join("/")}`;
  }

  async trySetObjectEntityAclPolicy(rawPath: string, aclPolicy: ObjectAclPolicy): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) return normalizedPath;

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: BlobClient;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

export { parseByteRange };
