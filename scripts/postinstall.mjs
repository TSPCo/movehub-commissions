import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

execSync("npx prisma generate", { stdio: "inherit" });

// `prisma generate` deletes this barrel file — recreate it so `@/generated/prisma` imports resolve.
writeFileSync(
  "src/generated/prisma/index.ts",
  'export * from "./client";\nexport * from "./enums";\nexport * from "./models";\n'
);
