import { eq } from "drizzle-orm";
import type { AppDbOrTx } from "../db/app-client";
import { sessions } from "../db/app-schema";

export type SessionRow = typeof sessions.$inferSelect;

export function insertSession(db: AppDbOrTx, row: SessionRow): void {
  db.insert(sessions).values(row).run();
}

export function findSessionById(db: AppDbOrTx, id: string): SessionRow | undefined {
  return db.select().from(sessions).where(eq(sessions.id, id)).get();
}

export function deleteSessionById(db: AppDbOrTx, id: string): void {
  db.delete(sessions).where(eq(sessions.id, id)).run();
}
