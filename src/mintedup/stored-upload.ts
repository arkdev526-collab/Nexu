import { deleteUpload } from "./store";
import { deleteR2Object, isR2ObjectKey } from "./upload-storage";

export type StoredUploadDeleteDrivers = {
  local: (filename: string) => Promise<void>;
  r2: (filename: string) => Promise<void>;
};

const defaultDrivers: StoredUploadDeleteDrivers = {
  local: deleteUpload,
  r2: deleteR2Object,
};

/** Delete either a legacy/local image or a durable R2 object by filename shape. */
export async function deleteStoredUpload(
  filename: string,
  drivers: StoredUploadDeleteDrivers = defaultDrivers,
): Promise<"file" | "r2"> {
  if (isR2ObjectKey(filename)) {
    await drivers.r2(filename);
    return "r2";
  }
  await drivers.local(filename);
  return "file";
}
