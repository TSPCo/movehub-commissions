import { db } from "@/lib/db";

export async function getSettings() {
  return db.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}
