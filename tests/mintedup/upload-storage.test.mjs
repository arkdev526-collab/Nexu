import assert from "node:assert/strict";
import test from "node:test";

const { IMAGE_RULES } = await import("../../src/mintedup/images.ts");
const { validateImageUploadIntent } = await import("../../src/mintedup/image-upload-policy.ts");
const { deleteStoredUpload } = await import("../../src/mintedup/stored-upload.ts");
const {
  finalObjectKey,
  objectKeyBelongsTo,
  parseObjectKey,
  pendingObjectKey,
  presignR2Upload,
  uploadStorageBackend,
  uploadStorageStatus,
} = await import("../../src/mintedup/upload-storage.ts");

function saveEnv(patch) {
  const previous = new Map();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

function withEnv(patch, fn) {
  const restore = saveEnv(patch);
  try {
    return fn();
  } finally {
    restore();
  }
}

async function withEnvAsync(patch, fn) {
  const restore = saveEnv(patch);
  try {
    return await fn();
  } finally {
    restore();
  }
}

test("R2 object keys are opaque, owner-bound and promote from pending to image", () => {
  const userId = "usr_private_internal_identifier";
  const listingId = "lst_private_internal_identifier";
  const key = pendingObjectKey({
    userId,
    listingId,
    imageId: "img_1234567890",
    extension: "webp",
    now: 1_788_566_400_000,
  });

  assert.equal(key.includes(userId), false);
  assert.equal(key.includes(listingId), false);
  assert.equal(key.includes("/"), false);
  assert.equal(objectKeyBelongsTo(key, userId, listingId, "pending"), true);
  assert.equal(objectKeyBelongsTo(key, "usr_other", listingId, "pending"), false);
  assert.equal(objectKeyBelongsTo(key, userId, "lst_other", "pending"), false);
  assert.equal(objectKeyBelongsTo(key, userId, listingId, "image"), false);

  const parsed = parseObjectKey(key);
  assert.equal(parsed?.stage, "pending");
  assert.equal(parsed?.createdAt, 1_788_566_400_000);
  assert.equal(parsed?.imageId, "img_1234567890");
  assert.equal(parsed?.extension, "webp");

  const final = finalObjectKey(key);
  assert.equal(parseObjectKey(final)?.stage, "image");
  assert.equal(objectKeyBelongsTo(final, userId, listingId, "image"), true);
  assert.equal(objectKeyBelongsTo(final, userId, listingId, "pending"), false);
});

test("malformed and path-like object keys are rejected", () => {
  for (const key of [
    "../../secret.jpg",
    "pending-user.listing.123.image.jpg",
    "image-/etc/passwd",
    "pending-a.b.1788566400000.img_1.gif",
    "",
  ]) {
    assert.equal(parseObjectKey(key), null, key);
  }
  assert.throws(() => finalObjectKey("../../secret.jpg"), /Invalid pending upload key/);
});

test("upload intent centrally enforces slot, type and 25 MB ceiling", () => {
  assert.deepEqual(
    validateImageUploadIntent({ slot: 0, contentType: "image/jpeg", size: 1024 }),
    { slot: 0, contentType: "image/jpeg", size: 1024 },
  );

  for (const [input, status] of [
    [{ slot: IMAGE_RULES.maxSlots, contentType: "image/jpeg", size: 1024 }, 400],
    [{ slot: 0, contentType: "image/gif", size: 1024 }, 415],
    [{ slot: 0, contentType: "image/jpeg", size: 0 }, 413],
    [{ slot: 0, contentType: "image/jpeg", size: IMAGE_RULES.maxBytes + 1 }, 413],
  ]) {
    assert.throws(
      () => validateImageUploadIntent(input),
      (error) => error?.status === status,
    );
  }
});

test("stored image deletion dispatches R2 objects and local files to different drivers", async () => {
  const calls = [];
  const drivers = {
    local: async (filename) => calls.push(["file", filename]),
    r2: async (filename) => calls.push(["r2", filename]),
  };

  assert.equal(await deleteStoredUpload("img_local123.jpg", drivers), "file");
  const pending = pendingObjectKey({
    userId: "usr_a",
    listingId: "lst_a",
    imageId: "img_a",
    extension: "jpg",
    now: 1_788_566_400_000,
  });
  const durable = finalObjectKey(pending);
  assert.equal(await deleteStoredUpload(durable, drivers), "r2");
  assert.deepEqual(calls, [
    ["file", "img_local123.jpg"],
    ["r2", durable],
  ]);
});

test("filesystem uploads are explicitly non-durable in production", () => {
  withEnv(
    {
      NODE_ENV: "production",
      MINTEDUP_UPLOAD_BACKEND: "file",
    },
    () => {
      assert.equal(uploadStorageBackend(), "file");
      const status = uploadStorageStatus();
      assert.equal(status.backend, "file");
      assert.equal(status.durable, false);
      assert.equal(status.configured, true);
      assert.equal(status.ready, false);
    },
  );
});

test("R2 is not reported ready when any required secret setting is missing", () => {
  withEnv(
    {
      MINTEDUP_UPLOAD_BACKEND: "r2",
      MINTEDUP_R2_ACCOUNT_ID: "account",
      MINTEDUP_R2_BUCKET: "mintedup-images",
      MINTEDUP_R2_ACCESS_KEY_ID: "access",
      MINTEDUP_R2_SECRET_ACCESS_KEY: undefined,
    },
    () => {
      const status = uploadStorageStatus();
      assert.equal(status.backend, "r2");
      assert.equal(status.configured, false);
      assert.equal(status.ready, false);
      assert.equal(status.durable, false);
    },
  );
});

test("invalid storage backend fails visibly instead of falling back", () => {
  withEnv({ MINTEDUP_UPLOAD_BACKEND: "magic-disk" }, () => {
    assert.throws(() => uploadStorageBackend(), /Unsupported MINTEDUP_UPLOAD_BACKEND/);
  });
});

test("presign rejects malformed keys and impossible lengths before touching R2", async () => {
  await assert.rejects(
    presignR2Upload({ key: "../../secret.jpg", contentType: "image/jpeg", contentLength: 100 }),
    /Invalid pending upload key/,
  );

  const key = pendingObjectKey({
    userId: "usr_a",
    listingId: "lst_a",
    imageId: "img_a",
    extension: "jpg",
    now: 1_788_566_400_000,
  });
  await assert.rejects(
    presignR2Upload({ key, contentType: "image/jpeg", contentLength: 0 }),
    /Invalid upload length/,
  );
});

test("configured R2 generates a short-lived content-type-bound PUT URL without network I/O", async () => {
  await withEnvAsync(
    {
      MINTEDUP_UPLOAD_BACKEND: "r2",
      MINTEDUP_R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
      MINTEDUP_R2_BUCKET: "mintedup-images",
      MINTEDUP_R2_ACCESS_KEY_ID: "test-access-key",
      MINTEDUP_R2_SECRET_ACCESS_KEY: "test-secret-key",
      MINTEDUP_R2_ENDPOINT: undefined,
    },
    async () => {
      const key = pendingObjectKey({
        userId: "usr_a",
        listingId: "lst_a",
        imageId: "img_a",
        extension: "jpg",
        now: 1_788_566_400_000,
      });
      const signed = await presignR2Upload({
        key,
        contentType: "image/jpeg",
        contentLength: 2048,
      });
      assert.equal(signed.headers["content-type"], "image/jpeg");
      assert.equal(signed.expiresIn, 600);
      assert.match(signed.url, /^https:\/\//);
      assert.match(signed.url, /X-Amz-Algorithm=AWS4-HMAC-SHA256/);
      assert.match(signed.url, /X-Amz-Expires=600/);
    },
  );
});
