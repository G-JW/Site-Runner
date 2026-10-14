import { verify } from "node:crypto";
import { compareVersions, type UpdateManifest } from "../../shared/updates.js";

export function verifyManifest(
  value: unknown,
  publicKey: string,
): UpdateManifest {
  if (!value || typeof value !== "object")
    throw new Error("Invalid update manifest");
  const envelope = value as Record<string, unknown>;
  if (
    typeof envelope.payload !== "string" ||
    envelope.payload.length > 100_000 ||
    typeof envelope.signature !== "string" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.signature)
  )
    throw new Error("Invalid signed envelope");
  const payload = Buffer.from(envelope.payload, "base64");
  if (
    !verify(null, payload, publicKey, Buffer.from(envelope.signature, "base64"))
  )
    throw new Error("Update signature does not match");
  const manifest = JSON.parse(payload.toString("utf8")) as UpdateManifest;
  if (
    manifest.format !== "site-runner-update" ||
    manifest.schema !== 1 ||
    typeof manifest.version !== "string"
  )
    throw new Error("Unknown manifest format");
  compareVersions(manifest.version, "0.0.0");
  if (
    !Array.isArray(manifest.artifacts) ||
    manifest.artifacts.length === 0 ||
    manifest.artifacts.length > 8
  )
    throw new Error("Invalid artifact list");
  const targets = new Set<string>();
  for (const item of manifest.artifacts) {
    if (
      !item ||
      !["darwin", "win32"].includes(item.platform) ||
      !["arm64", "x64"].includes(item.arch) ||
      typeof item.name !== "string" ||
      !/^[A-Za-z0-9._-]+$/.test(item.name) ||
      !item.name.endsWith(item.platform === "darwin" ? ".zip" : ".exe") ||
      !Number.isSafeInteger(item.size) ||
      item.size < 1 ||
      item.size > 2_000_000_000 ||
      !/^[a-f0-9]{64}$/.test(item.sha256)
    )
      throw new Error("Invalid artifact metadata");
    const target = `${item.platform}-${item.arch}`;
    if (targets.has(target)) throw new Error("Duplicate update target");
    targets.add(target);
  }
  return manifest;
}
