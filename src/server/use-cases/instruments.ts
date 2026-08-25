import type { InstrumentBackedType } from "@/domain";
import type { Db } from "../db/client";
import {
  findAllInstruments,
  findInstrumentById,
  insertInstrument,
  type InstrumentRow,
} from "../repositories/instruments";

export interface CreateInstrumentInput {
  type: InstrumentBackedType;
  name: string;
  unitLabel?: string;
}

// No Server Action wraps this yet (Instrument Model delta §17 steps 1-6) —
// nothing in the UI lets a user hand-author an Instrument in this pass,
// only the catalogue seed (step 5) and tests call this directly.
export function createInstrument(db: Db, input: CreateInstrumentInput): InstrumentRow {
  const now = new Date().toISOString();
  const instrument: InstrumentRow = {
    id: crypto.randomUUID(),
    type: input.type,
    name: input.name,
    unitLabel: input.unitLabel ?? null,
    createdAt: now,
    updatedAt: now,
  };
  insertInstrument(db, instrument);
  return instrument;
}

export function getInstrument(db: Db, id: string): InstrumentRow | undefined {
  return findInstrumentById(db, id);
}

export function listInstruments(db: Db): InstrumentRow[] {
  return findAllInstruments(db);
}
