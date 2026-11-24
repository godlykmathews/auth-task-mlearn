import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

mkdirSync("data", { recursive: true });
if (existsSync(".env.local")) {
  console.log(".env.local already exists; left unchanged.");
} else {
  writeFileSync(".env.local", `JWT_SECRET=${randomBytes(48).toString("base64url")}\nDATABASE_URL=file:./data/harbor.db\nAPP_URL=http://127.0.0.1:3000\n`, { mode: 0o600, flag: "wx" });
  console.log("Created .env.local with a random signing secret. Start with npm run dev.");
}
