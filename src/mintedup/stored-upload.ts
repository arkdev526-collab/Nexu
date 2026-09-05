import { deleteUpload, readUpload } from "./store";
import { deleteR2Object, parseObjectKey, readR2Object } from "./upload-storage";

export type StoredUploadDeleteDrivers = {
  local: (filename: string) => Promise<void>;
  r2: (filename: string) => Promise<void>;
};

const defaultDrivers: StoredUploadDeleteDrivers = {
  local: deleteUpload,
  r2: deleteR2Object,
};

export type StoredUploadReadDrivers = {
  local: (filename: string) => Promise<Buffer | null>;
  r2: (filename: string) => Promise<Buffer | null>;
};

const defaultReadDrivers: StoredUploadReadDrivers = {
  local: readUpload,
  r2: readR2Object,
};

/** Read a legacy/local image or an accepted durable image through one boundary. */
export async function readStoredUpload(
  filename: string,
  drivers: StoredUploadReadDrivers = defaultReadDrivers,
): Promise<Buffer | null> {
  const object = parseObjectKey(filename);
  if (object?.stage === "pending") return null;
  try {
    return object ? await drivers.r2(filename) : await drivers.local(filename);
  } catch {
    return null;
  }
}

/** Delete either a legacy/local image or a durable R2 object by filename shape. */
export async function deleteStoredUpload(
  filename: string,
  drivers: StoredUploadDeleteDrivers = defaultDrivers,
): Promise<"file" | "r2"> {
  if (parseObjectKey(filename)) {
    await drivers.r2(filename);
    return "r2";
  }
  await drivers.local(filename);
  return "file";
}
