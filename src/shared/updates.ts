export type UpdatePhase =
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "error"
  | "unsupported";
export type UpdateError =
  | "network"
  | "manifest"
  | "download"
  | "permission"
  | "busy"
  | "install"
  | "platform";
export interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  version?: string;
  notes?: string;
  size?: number;
  progress?: number;
  transferred?: number;
  error?: UpdateError;
}
export interface UpdateArtifact {
  platform: "darwin" | "win32";
  arch: "arm64" | "x64";
  name: string;
  size: number;
  sha256: string;
}
export interface UpdateManifest {
  format: "site-runner-update";
  schema: 1;
  version: string;
  artifacts: UpdateArtifact[];
}
export interface SignedUpdateManifest {
  payload: string;
  signature: string;
}

export function compareVersions(left: string, right: string): number {
  if (!/^\d+\.\d+\.\d+$/.test(left) || !/^\d+\.\d+\.\d+$/.test(right))
    throw new Error("Only stable semantic versions are supported");
  const a = left.split(".").map(Number),
    b = right.split(".").map(Number);
  if ([...a, ...b].some((part) => !Number.isSafeInteger(part)))
    throw new Error("Invalid version");
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! > b[i]! ? 1 : -1;
  }
  return 0;
}
