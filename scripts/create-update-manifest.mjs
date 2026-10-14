import { createHash, sign, verify, createPrivateKey } from "node:crypto";
import {
  createReadStream,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(version))
  throw new Error("Only stable versions can be published");
if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== `v${version}`)
  throw new Error("Tag does not match package version");
const directory = path.resolve(process.argv[2] ?? "release");
const keyText =
  process.env.SITE_RUNNER_UPDATE_PRIVATE_KEY ??
  (process.env.SITE_RUNNER_UPDATE_KEY_FILE
    ? readFileSync(process.env.SITE_RUNNER_UPDATE_KEY_FILE, "utf8")
    : "");
if (!keyText) throw new Error("Missing update signing key");
const key = createPrivateKey(keyText);
if (key.asymmetricKeyType !== "ed25519")
  throw new Error("Expected an Ed25519 update key");
const { updateConfig } = await import("../dist/main/shared/update-config.js");
const artifacts = [];
for (const name of readdirSync(directory).sort()) {
  const match =
    /^Site-Runner-(\d+\.\d+\.\d+)-(darwin|win32)-(arm64|x64)\.(zip|exe)$/.exec(
      name,
    );
  if (!match) continue;
  if (match[1] !== version) continue;
  if (match[2] === "darwin" ? match[4] !== "zip" : match[4] !== "exe")
    throw new Error("Unexpected release artifact");
  const filename = path.join(directory, name),
    hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  artifacts.push({
    platform: match[2],
    arch: match[3],
    name,
    size: statSync(filename).size,
    sha256: hash.digest("hex"),
  });
}
if (!artifacts.length) throw new Error("No update packages found");
const payload = Buffer.from(
  JSON.stringify({
    format: "site-runner-update",
    schema: 1,
    version,
    artifacts,
  }),
);
const signature = sign(null, payload, key);
if (!verify(null, payload, updateConfig.publicKey, signature))
  throw new Error(
    "Signing key does not match the public key embedded in the application",
  );
writeFileSync(
  path.join(directory, "site-runner-update.json"),
  JSON.stringify(
    {
      payload: payload.toString("base64"),
      signature: signature.toString("base64"),
    },
    null,
    2,
  ),
);
console.log(
  `Signed update manifest for ${version}: ${artifacts.length} artifact(s)`,
);
