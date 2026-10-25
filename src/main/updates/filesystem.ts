import { createRequire } from "node:module";
import type * as NodeFileSystem from "node:fs";

// Electron's patched fs treats .asar files as virtual directories. Update bundles
// must be inspected and removed as ordinary files, including during rollback.
const require = createRequire(import.meta.url);
const filesystem = require(
  process.versions.electron ? "original-fs" : "node:fs",
) as typeof NodeFileSystem;

export const updateFileSystem = filesystem.promises;
