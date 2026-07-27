import { PrismaClient } from "../src/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "file:./dev.db" });
const db = new PrismaClient({ adapter });

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@move-hub.co.uk";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

  const existing = await db.user.findUnique({ where: { email } });
  if (!existing) {
    await db.user.create({
      data: {
        name: "Admin",
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    console.log(`Seeded admin user: ${email} / ${password}`);
  } else {
    console.log(`Admin user already exists: ${email}`);
  }

  await db.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
  console.log("Ensured settings row exists.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
