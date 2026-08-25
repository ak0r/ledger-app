import { eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { sessions } from "../db/schema";

export type SessionRow = typeof sessions.$inferSelect;

export function insertSession(db: DbOrTx, row: SessionRow): void {
  db.insert(sessions).values(row).run();
}

export function findSessionById(db: DbOrTx, id: string): SessionRow | undefined {
  return db.select().from(sessions).where(eq(sessions.id, id)).get();
}

export function deleteSessionById(db: DbOrTx, id: string): void {
  db.delete(sessions).where(eq(sessions.id, id)).run();
}
