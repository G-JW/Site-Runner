// Public verification key only. The signing key lives in GitHub Actions Secrets.
export const updateConfig = {
  owner: "G-JW",
  repo: "Site-Runner",
  publicKey:
    "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEARDw4uTpp8Mk+b0JrH4qwTxRevcaw7aHq9Ib+DHGWHQw=\n-----END PUBLIC KEY-----\n",
} as const;
