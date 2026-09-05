import { createHash, randomUUID } from "node:crypto";
import {
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
const HEALTH_PROBE_TIMEOUT_MS = 5_000;
const HEALTH_CLEANUP_TIMEOUT_MS = 2_000;
const HEALTH_BODY = Buffer.from("ok", "utf8");
const TOKEN_RE = "[A-Za-z0-9_-]{43}";
const KEY_RE = new RegExp(
  `^(pending|image)-(${TOKEN_RE})\\.(${TOKEN_RE})\\.(\\d{13})\\.([A-Za-z0-9_-]+)\\.(jpg|png|webp)$`,
);

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
      // Presigned browser PUTs have no Body at signing time. Do not let the SDK
      // attach the checksum of an empty body to a URL intended for image bytes.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    cachedFingerprint = fingerprint;
  }
  return cachedClient;
}

export async function probeR2Bucket(): Promise<void> {
  const config = requireR2();
  const client = clientFor(config);
  const key = `pending-health-${Date.now()}-${randomUUID().replace(/-/g, "")}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_PROBE_TIMEOUT_MS);
  let cleanupNeeded = false;
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: HEALTH_BODY,
        ContentLength: HEALTH_BODY.length,
        ContentType: "application/octet-stream",
        CacheControl: "no-store",
        IfNoneMatch: "*",
      }),
      { abortSignal: controller.signal },
    );
    cleanupNeeded = true;

    const head = await client.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
      { abortSignal: controller.signal },
    );
    if (Number(head.ContentLength ?? -1) !== HEALTH_BODY.length) {
      throw new Error("R2 health object metadata did not match.");
    }

    const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
      abortSignal: controller.signal,
    });
    if (!result.Body) throw new Error("R2 health object had no body.");
    const bytes = Buffer.from(await result.Body.transformToByteArray());
    if (!bytes.equals(HEALTH_BODY)) throw new Error("R2 health object body did not match.");

    await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }), {
      abortSignal: controller.signal,
    });
    cleanupNeeded = false;
  } finally {
    clearTimeout(timeout);
    if (cleanupNeeded) {
      const cleanupController = new AbortController();
      const cleanupTimeout = setTimeout(
        () => cleanupController.abort(),
        HEALTH_CLEANUP_TIMEOUT_MS,
      );
      try {
        await client
          .send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }), {
            abortSignal: cleanupController.signal,
          })
          .catch(() => undefined);
      } finally {
        clearTimeout(cleanupTimeout);
      }
    }
  }
}

export async function uploadStorageStatus(
  probe: () => Promise<void> = probeR2Bucket,
): Promise<UploadStorageStatus> {
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
  if (!config) {
    return {
      backend,
      durable: false,
      configured: false,
      ready: false,
      bucket: null,
      detail: "R2 is selected but required credentials or bucket configuration are missing.",
    };
  }

  try {
    await probe();
  } catch {
    return {
      backend,
      durable: true,
      configured: true,
      ready: false,
      bucket: config.bucket,
      detail:
        "Private R2 configuration is present, but the live read/write/delete health probe failed. Verify the endpoint, bucket and bucket-scoped credentials.",
    };
  }

  return {
    backend,
    durable: true,
    configured: true,
    ready: true,
    bucket: config.bucket,
    detail:
      "Private R2 object storage passed its live read/write/delete health probe; uploads use short-lived signed URLs.",
  };
}

function ownershipToken(kind: "user" | "listing", value: string): string {
  return createHash("sha256").update(`${kind}\0${value}`, "utf8").digest("base64url");
}

export type ParsedObjectKey = {
  stage: "pending" | "image";
  userToken: string;
  listingToken: string;
  createdAt: number;
  imageId: string;
  extension: "jpg" | "png" | "webp";
};

export function parseObjectKey(key: string): ParsedObjectKey | null {
  const match = KEY_RE.exec(key);
  if (!match) return null;
  const createdAt = Number(match[4]);
  if (!Number.isFinite(createdAt)) return null;
  return {
    stage: match[1] as "pending" | "image",
    userToken: match[2],
    listingToken: match[3],
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
      parsed.userToken === ownershipToken("user", userId) &&
      parsed.listingToken === ownershipToken("listing", listingId) &&
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
  return `pending-${ownershipToken("user", input.userId)}.${ownershipToken("listing", input.listingId)}.${createdAt}.${input.imageId}.${input.extension}`;
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
  if (!Number.isFinite(input.contentLength) || input.contentLength <= 0) {
    throw new Error("Invalid upload length.");
  }
  const config = requireR2();
  // The exact announced byte length and MIME type are both signed. Actual
  // bytes are still verified at finalisation before entering the listing.
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.key,
    ContentType: input.contentType,
    ContentLength: input.contentLength,
    CacheControl: "no-store",
  });
  const url = await getSignedUrl(clientFor(config), command, {
    expiresIn: UPLOAD_TTL_SECONDS,
    // Bind both browser-controlled MIME and browser-computed Content-Length to
    // the signature. R2 rejects a reused URL when either value differs.
    signableHeaders: new Set(["content-length", "content-type"]),
  });
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

export type R2PromotionDrivers = {
  delete: (key: string) => Promise<void>;
  put: (input: {
    key: string;
    bytes: Buffer;
    contentType: string;
  }) => Promise<void>;
};

async function putValidatedR2Object(input: {
  key: string;
  bytes: Buffer;
  contentType: string;
}): Promise<void> {
  const config = requireR2();
  await clientFor(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.key,
      Body: input.bytes,
      ContentLength: input.bytes.length,
      ContentType: input.contentType,
      CacheControl: "public, max-age=31536000, immutable",
      IfNoneMatch: "*",
    }),
  );
}

const defaultPromotionDrivers: R2PromotionDrivers = {
  delete: deleteR2Object,
  put: putValidatedR2Object,
};

export async function promoteValidatedR2Object(
  input: {
    pendingKey: string;
    contentType: string;
    bytes: Buffer;
    promotionId?: string;
  },
  drivers: R2PromotionDrivers = defaultPromotionDrivers,
): Promise<string> {
  const parsed = parseObjectKey(input.pendingKey);
  if (!parsed || parsed.stage !== "pending") throw new Error("Invalid pending upload key.");
  if (input.bytes.length <= 0) throw new Error("Validated image bytes are required.");

  const promotionId = input.promotionId ?? randomUUID().replace(/-/g, "");
  if (!/^[A-Za-z0-9_-]+$/.test(promotionId)) throw new Error("Invalid promotion id.");
  const destination = `image-${parsed.userToken}.${parsed.listingToken}.${parsed.createdAt}.${parsed.imageId}-${promotionId}.${parsed.extension}`;

  // Delete the reusable pending target before creating the immutable image.
  // If deletion fails, no destination exists to orphan. The final object is
  // then written from the exact buffer that passed validation, so later reuse
  // of the presigned URL cannot change the accepted bytes.
  await drivers.delete(input.pendingKey);
  try {
    await drivers.put({
      key: destination,
      bytes: input.bytes,
      contentType: input.contentType,
    });
  } catch (error) {
    // A transport error can be ambiguous after R2 received a PUT. The unique
    // promotion key makes an unconditional cleanup retry safe.
    await drivers.delete(destination).catch(() => undefined);
    throw error;
  }
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
