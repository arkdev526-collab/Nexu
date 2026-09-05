import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type UploadStorageBackend = "file" | "r2";

export type UploadStorageStatus = {
  backend: UploadStorageBackend;
  durable: boolean;
  configured: boolean;
  ready: boolean;
  bucket: string | null;
  detail: string;
};

type R2Config = {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
};

const UPLOAD_TTL_SECONDS = 10 * 60;
const READ_TTL_SECONDS = 5 * 60;
const KEY_RE = /^(pending|image)-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.(\d{13})\.([A-Za-z0-9_-]+)\.(jpg|png|webp)$/;

let cachedClient: S3Client | null = null;
let cachedFingerprint = "";

function required(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function uploadStorageBackend(): UploadStorageBackend {
  const raw = (process.env.MINTEDUP_UPLOAD_BACKEND ?? "file").trim().toLowerCase();
  if (raw === "file" || raw === "r2") return raw;
  throw new Error(`Unsupported MINTEDUP_UPLOAD_BACKEND: ${raw}`);
}

function r2Config(): R2Config | null {
  const accountId = required("MINTEDUP_R2_ACCOUNT_ID");
  const bucket = required("MINTEDUP_R2_BUCKET");
  const accessKeyId = required("MINTEDUP_R2_ACCESS_KEY_ID");
  const secretAccessKey = required("MINTEDUP_R2_SECRET_ACCESS_KEY");
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) return null;
  const endpoint =
    required("MINTEDUP_R2_ENDPOINT") || `https://${accountId}.r2.cloudflarestorage.com`;
  return { bucket, endpoint, accessKeyId, secretAccessKey };
}

function requireR2(): R2Config {
  const config = r2Config();
  if (!config) {
    throw new Error(
      "R2 upload storage is selected but its account, bucket or access-key configuration is incomplete.",
    );
  }
  return config;
}

function clientFor(config: R2Config): S3Client {
  const fingerprint = `${config.endpoint}\n${config.accessKeyId}`;
  if (!cachedClient || cachedFingerprint !== fingerprint) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    cachedFingerprint = fingerprint;
  }
  return cachedClient;
}

export function uploadStorageStatus(): UploadStorageStatus {
  const backend = uploadStorageBackend();
  if (backend === "file") {
    return {
      backend,
      durable: false,
      configured: true,
      ready: process.env.NODE_ENV !== "production",
      bucket: null,
      detail:
        process.env.NODE_ENV === "production"
          ? "Filesystem upload storage is ephemeral in production. Select R2 before release."
          : "Local filesystem upload storage is enabled for development.",
    };
  }

  const config = r2Config();
  return {
    backend,
    durable: Boolean(config),
    configured: Boolean(config),
    ready: Boolean(config),
    bucket: config?.bucket ?? null,
    detail: config
      ? "Private R2 object storage is configured; uploads use short-lived signed URLs."
      : "R2 is selected but required credentials or bucket configuration are missing.",
  };
}

function encodeId(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeId(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export type ParsedObjectKey = {
  stage: "pending" | "image";
  userId: string;
  listingId: string;
  createdAt: number;
  imageId: string;
  extension: "jpg" | "png" | "webp";
};

export function parseObjectKey(key: string): ParsedObjectKey | null {
  const match = KEY_RE.exec(key);
  if (!match) return null;
  const userId = decodeId(match[2]);
  const listingId = decodeId(match[3]);
  const createdAt = Number(match[4]);
  if (!userId || !listingId || !Number.isFinite(createdAt)) return null;
  return {
    stage: match[1] as "pending" | "image",
    userId,
    listingId,
    createdAt,
    imageId: match[5],
    extension: match[6] as "jpg" | "png" | "webp",
  };
}

export function isR2ObjectKey(key: string): boolean {
  return parseObjectKey(key) !== null;
}

export function objectKeyBelongsTo(
  key: string,
  userId: string,
  listingId: string,
  stage?: "pending" | "image",
): boolean {
  const parsed = parseObjectKey(key);
  return Boolean(
    parsed &&
      parsed.userId === userId &&
      parsed.listingId === listingId &&
      (!stage || parsed.stage === stage),
  );
}

export function pendingObjectKey(input: {
  userId: string;
  listingId: string;
  imageId: string;
  extension: "jpg" | "png" | "webp";
  now?: number;
}): string {
  const createdAt = input.now ?? Date.now();
  return `pending-${encodeId(input.userId)}.${encodeId(input.listingId)}.${createdAt}.${input.imageId}.${input.extension}`;
}

export function finalObjectKey(pendingKey: string): string {
  const parsed = parseObjectKey(pendingKey);
  if (!parsed || parsed.stage !== "pending") throw new Error("Invalid pending upload key.");
  return pendingKey.replace(/^pending-/, "image-");
}

export async function presignR2Upload(input: {
  key: string;
  contentType: string;
  contentLength: number;
}): Promise<{ url: string; expiresIn: number; headers: Record<string, string> }> {
  const parsed = parseObjectKey(input.key);
  if (!parsed || parsed.stage !== "pending") throw new Error("Invalid pending upload key.");
  const config = requireR2();
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.key,
    ContentType: input.contentType,
    ContentLength: input.contentLength,
    CacheControl: "no-store",
  });
  const url = await getSignedUrl(clientFor(config), command, { expiresIn: UPLOAD_TTL_SECONDS });
  return {
    url,
    expiresIn: UPLOAD_TTL_SECONDS,
    headers: { "content-type": input.contentType },
  };
}

export async function headR2Object(key: string): Promise<{
  bytes: number;
  contentType: string;
}> {
  const config = requireR2();
  const result = await clientFor(config).send(
    new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
  );
  return {
    bytes: Number(result.ContentLength ?? -1),
    contentType: result.ContentType ?? "",
  };
}

export async function readR2Object(key: string): Promise<Buffer> {
  const config = requireR2();
  const result = await clientFor(config).send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
  );
  if (!result.Body) throw new Error("Stored image has no body.");
  const bytes = await result.Body.transformToByteArray();
  return Buffer.from(bytes);
}

export async function deleteR2Object(key: string): Promise<void> {
  const config = requireR2();
  await clientFor(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

export async function promotePendingR2Object(input: {
  pendingKey: string;
  contentType: string;
}): Promise<string> {
  const config = requireR2();
  const destination = finalObjectKey(input.pendingKey);
  await clientFor(config).send(
    new CopyObjectCommand({
      Bucket: config.bucket,
      Key: destination,
      CopySource: `${config.bucket}/${encodeURIComponent(input.pendingKey)}`,
      ContentType: input.contentType,
      CacheControl: "public, max-age=31536000, immutable",
      MetadataDirective: "REPLACE",
    }),
  );
  await deleteR2Object(input.pendingKey);
  return destination;
}

export async function presignR2Read(key: string): Promise<{ url: string; expiresIn: number }> {
  const parsed = parseObjectKey(key);
  if (!parsed || parsed.stage !== "image") throw new Error("Invalid stored image key.");
  const config = requireR2();
  const url = await getSignedUrl(
    clientFor(config),
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn: READ_TTL_SECONDS },
  );
  return { url, expiresIn: READ_TTL_SECONDS };
}
