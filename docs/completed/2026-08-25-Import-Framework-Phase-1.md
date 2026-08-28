# Delta: Import Framework — Phase 1

**Date:** 2026-08-25  
**Status:** Locked for implementation

## 1. Purpose

Introduce the foundation for importing external financial data into Ledger.

Phase 1 is deliberately deterministic. The import framework should parse and normalize source data, resolve the relevant Ledger account, show the proposed transactions for user approval, and only then create normal Ledger transactions.

The framework must also preserve **source provenance**: every uploaded import file receives a unique Import ID, and every Ledger transaction created from that import retains that Import ID.

---

## 2. Locked Import Pipeline

```text
Upload File
    ↓
Parse
    ├── Source-specific adapter
    └── Generic parser fallback
    ↓
Normalise
    ↓
Account Resolution
    ↓
Import Preview
    ↓
User Approval
    ↓
Commit to Ledger
```

The pipeline is intentionally simple for Phase 1.

### Future extension points

Two capabilities are explicitly designed as plugins but are **not part of Phase 1**:

```text
Normalise
    ↓
[ Rules Plugin ]              ← future
    ↓
Account Resolution
    ↓
[ Duplicate Determination ]   ← future
    ↓
Import Preview
```

Rules and duplicate determination must not be implemented as implicit Phase 1 behaviour.

---

## 3. Import Entity

An **Import** represents one uploaded source file and one import attempt.

Each uploaded file receives a unique, stable **Import ID**.

Conceptually:

```text
Import
├── id                  # unique Import ID
├── filename
├── source / adapter
├── uploaded_at
├── status
├── date range           # if available after parsing
└── metadata             # source-specific metadata where useful
```

The Import record provides the provenance boundary for the entire operation.

The system must be able to answer:

> Which source file produced this Ledger transaction?

by following the transaction's Import ID back to the Import record.

### Import lifecycle

A conceptual lifecycle is:

```text
uploaded
    ↓
parsing
    ↓
ready / preview
    ↓
approved
    ↓
committed
```

Failure states may be added as required by implementation.

---

## 4. Transaction Provenance

Every Ledger transaction created by an import must retain a reference to the **Import ID** that produced it.

Conceptually:

```text
Import
  id = IMP-123

        ↓

Ledger Transaction
  import_id = IMP-123
```

This reference is required even after the import has been committed.

It must not be treated as temporary UI state or discarded after successful import.

This gives Ledger permanent source provenance:

```text
Ledger Transaction
      ↓
Import ID
      ↓
Original uploaded file / Import record
```

A transaction created manually outside the import workflow has no Import reference.

---

## 5. Parse

The Parse stage determines how the uploaded file should be interpreted.

Two paths are supported:

### Source-specific adapter

Where Ledger recognizes a known source format:

```text
HDFC statement
    ↓
HDFC adapter
    ↓
Parsed rows
```

The source adapter is responsible only for understanding the source format.

It must not contain Ledger-specific categorization or accounting intelligence.

### Generic parser

If no source-specific adapter is available, Ledger may use a generic parser where the file format permits it.

For example:

```text
Generic CSV
    ↓
Column mapping / parsing
    ↓
Parsed rows
```

The framework should allow additional source adapters to be added without changing the downstream import pipeline.

---

## 6. Normalise

The Normalise stage converts provider-specific parsed data into a common Ledger import representation.

The normalized representation should capture the information available from the source, such as:

```text
date
description
amount
direction
reference / transaction identifier
source account information
source-specific metadata
raw source data where useful
```

The exact normalized fields should be finalized during implementation against the first real statement formats.

The important boundary is:

> Provider-specific formats end at Normalise.

Everything after Normalise operates on the common representation.

---

## 7. Account Resolution

Account Resolution determines which existing Ledger Account corresponds to the imported source account and establishes the known side of the transaction.

For example:

```text
HDFC Bank statement
        ↓
Assets:HDFC Bank
```

The counter-account may remain unresolved.

An imported transaction must not invent financial meaning merely because the source description looks familiar.

For example:

```text
HDFC Bank
    ↓
NEFT XYZ BROKER
₹50,000
```

may initially become:


```text
HDFC Bank → Unknown
₹50,000
```

The first version should default to **Unknown** when the destination/counter-account cannot be established.

Rules and intelligent classification are future capabilities.

---

## 8. Import Preview

Before anything is written to the accounting ledger, the complete proposed import must be presented to the user.

The preview represents the transactions that will be created if approved.

Conceptually:

```text
Import
  ↓
35 normalized transactions
  ↓
Account resolution
  ↓
Import Preview
```

The preview should allow the user to inspect the proposed transactions and make any required corrections supported by the Phase 1 UI.

The preview is a mandatory approval boundary.

---

## 9. User Approval

No imported transaction is committed to the Ledger before explicit user approval.

The boundary is:

```text
Import Preview
      ↓
USER APPROVAL
      ↓
Commit
```

Parsing, normalization, and account resolution may happen automatically.

Ledger mutation may not.

---

## 10. Commit to Ledger

After approval, the import is converted into normal Ledger transactions.

Imported transactions must use the same transaction/posting model as manually created transactions.

The import system should not create a parallel accounting model.

Conceptually:

```text
Import Preview
      ↓
Approved
      ↓
Ledger Transaction
      ├── Posting
      ├── Posting
      └── import_id → Import.id
```

Once committed, the transaction behaves like any other Ledger transaction while retaining its import provenance.

---

## 11. Import Table / History

Ledger should have an Import table/list that records every uploaded import file.

The UI should be able to show at minimum:

```text
Import ID
Filename
Source / adapter
Imported date
Status
Transaction count
```

The Import ID should be unique and stable.

This provides an import history and makes it possible to trace transactions back to their source.

Example:

```text
IMP-20260825-001
    HDFC_August_2026.xlsx
    HDFC
    42 transactions
    Committed
```

A future import detail view can use this record to show the imported transactions.

---

## 12. Phase 1 Scope

### In scope

- Import entity/table
- Unique Import ID per uploaded file
- Import history/list
- File upload
- Source adapter abstraction
- Generic parser fallback
- Parsing
- Normalization
- Account resolution
- Unknown counter-account handling
- Import preview
- Explicit user approval
- Commit to normal Ledger transactions
- Import ID reference on committed Ledger transactions
- Basic import lifecycle/status

### Explicitly out of scope

- Global Rules plugin
- Duplicate Determination plugin
- Automatic transaction categorization
- AI/ML transaction classification
- Intelligent merchant recognition
- SIP detection
- Broker/investment intelligence
- Automatic reconciliation
- Advanced import matching
- Import-specific accounting model

These can be introduced later through the defined extension points.

---

## 13. Architectural Principle

The import framework follows one core principle:

> **Import captures what the source says. Ledger records what the user approves.**

The first version should not attempt to infer financial intent.

Unknown is a valid intermediate state.

The architecture should therefore preserve:

```text
Source data
    ↓
Normalized facts
    ↓
Resolved information
    ↓
User-approved interpretation
    ↓
Ledger transaction
```

while retaining:

```text
Ledger transaction
    ↓
Import ID
    ↓
Source file / Import record
```

for permanent provenance.

---

## Implementation note (added when archived, 2026-08-26)

Shipped as designed, with these locked interpretations (see
`docs/07-decisions.md` ADR-030/031/032 and the two follow-on deltas archived
alongside this one): no persisted staging table — Parse through Preview run
in-memory per request, only the terminal committed state is ever written;
Unknown counter-accounts reuse the existing frozen `EXPENSE`/`INCOME`
classifications rather than a new type; CSV parsing uses `papaparse`. The
Import entity described here was later renamed `ImportFile` by the
2026-08-25 Import Workflow delta once "Import" also came to mean the
(never-persisted) multi-file review workspace.
