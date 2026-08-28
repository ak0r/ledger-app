# 2026-08-25 — Import Workflow Delta

## Intent

Implement Phase 1 of the Ledger import workflow.

Import is a temporary, editable workspace where imported transactions are parsed,
normalised, resolved and reviewed before being committed to the Ledger.

The user must explicitly approve the final import.

The Import screen is the complete import workspace. There is no separate persistent
staging screen or draft-import workflow.

## 1. Locked Import Lifecycle

```text
Upload file(s)
    ↓
Parse
    ↓
Normalise
    ↓
Account Resolution
    ↓
Editable Import Workspace
    ↓
User Approval
    ↓
Commit to Ledger
```

Parsed and normalised transaction candidates are transient.

If the user closes the page, refreshes, navigates away, or otherwise abandons the
import before approval, the temporary import state is lost.

There is no resumable import in Phase 1.

## 2. Import Files

Every uploaded file receives a unique `ImportFile` ID.

The import file represents provenance of imported data, not individual transactions.

An import may contain multiple files.

Example:

```text
Import
├── ImportFile: impfile_001
│   ├── filename: HDFC_Apr_Aug_2026.xlsx
│   ├── source: HDFC Bank
│   └── transaction count: 35
│
└── ImportFile: impfile_002
    ├── filename: HDFC_Sep_2026.xlsx
    ├── source: HDFC Bank
    └── transaction count: 22
```

Each committed transaction retains a reference to its originating `ImportFile`.

## 3. Import History

Import history is intentionally lightweight.

It stores file-level import references/metadata, such as:

- ImportFile ID
- filename
- source/adapter, when known
- import date/time
- relevant date range, when available
- transaction count
- import status/result

It does **not** persist a copy of every parsed transaction.

The Ledger remains the source of truth for committed transactions.

## 4. Import Screen

The Import screen is a temporary transaction workspace.

The transaction list should reuse the existing Transactions page transaction-table
language and interaction patterns wherever applicable:

- same visual language
- same search/filter model
- same sorting conventions where applicable
- same pagination/density conventions
- same editing interaction patterns where applicable
- same amount/date/account presentation conventions

The Import screen adds import-specific information and actions.

### Screen structure

```text
Import

┌─────────────────────────────────────────────────────────────┐
│ Uploaded Files                                              │
│                                                             │
│ [ HDFC_Apr_Aug_2026.xlsx ]  [ + Add another file ]         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Import Summary                                               │
│ 35 transactions    0 new accounts                           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Search / Filters                                             │
│                                                             │
│ [ Search transactions ] [ Filters ]                         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Transaction Table                                           │
│                                                             │
│ Date | Description | Account | Dr/Cr | Amount | Counterpart│
│ ...                                                         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                      [ Import 35 transactions ]│
└─────────────────────────────────────────────────────────────┘
```

The exact visual treatment should follow the existing Ledger design system and
Transactions page rather than introducing a new table style.

## 5. Transaction Table

The Import transaction table represents the current candidate state.

The importer proposes values, but those values are not authoritative.

Every imported transaction can be edited before commit.

Editable fields:

- Date
- Description
- Direction (`Dr` / `Cr`)
- Amount
- Account
- Counterpart/category

Example:

```text
05 Apr 2026
ACH D - HDFC BANK LTD
HDFC Bank
Dr
₹7,277
Expense:Unknown
```

The user can change any of these values before committing.

For example:

```text
05 Apr 2026
ACH D - HDFC BANK LTD
HDFC Bank
Dr
₹7,277
Utilities
```

The final Ledger transaction uses the edited values.

## 6. Direction Handling

The importer interprets statement direction conservatively.

Phase 1 default mapping:

```text
Dr → Expense:Unknown
Cr → Income:Unknown
```

This applies regardless of the source account class.

### Bank debit

```text
HDFC Bank
Dr ₹1,000
```

becomes:

```text
HDFC Bank → Expense:Unknown
₹1,000
```

### Bank credit

```text
HDFC Bank
Cr ₹10,000
```

becomes:

```text
Income:Unknown → HDFC Bank
₹10,000
```

### Credit card credit

A credit on a Credit Card is still initially interpreted as:

```text
Income:Unknown → HDFC Credit Card
₹5,000
```

The importer does not attempt to determine whether this is a refund, reversal,
transfer, payment adjustment, or another financial event.

The user can override the counterpart/account during import.

## 7. Unknown Accounts

`Income:Unknown` and `Expense:Unknown` are reusable catch-all accounts.

The importer must not create a new Unknown account for every transaction.

For example, multiple unexplained debits all use:

```text
Expense:Unknown
```

### Missing Unknown account

If the required catch-all account does not exist, the importer must not silently
create it.

Instead, show it under:

```text
New Accounts Detected
```

Example:

```text
New Accounts Detected

+ Expense:Unknown
+ Income:Unknown
```

The user can approve creation as part of final import approval.

Once created, the account can be reused by future imports.

## 8. Account Resolution

Account identification performed by the importer is a proposal.

The user must be able to change the resolved account.

Example:

```text
Importer detected:

Account: Amazon
Status: New account detected
```

The user can choose:

```text
Use existing account → Shopping
```

instead of creating `Amazon`.

Likewise, if the importer incorrectly identifies:

```text
HDFC Bank
```

the user can resolve the transaction to another existing account.

Account resolution therefore supports:

```text
Detected account
    ├── Existing account
    └── New account
```

The selected resolution is applied to the candidate transaction before commit.

## 9. Transaction Filters

The Import screen uses the same transaction filtering model as the normal
Transactions screen.

Users can search and filter imported transaction candidates without leaving the
Import workflow.

Filtering operates on temporary import candidates and does not alter Ledger data
until approval.

## 10. Bulk Operations

The Import workspace should support the existing transaction-table selection model
where appropriate.

Bulk editing can modify multiple candidate transactions.

Examples:

```text
Select 12 transactions
→ Change Account
```

```text
Select 8 transactions
→ Change Counterpart
```

```text
Select transactions
→ Change Direction
```

Rules are not implemented as part of Phase 1.

The workspace should remain extensible so a future Rules plugin can provide:

```text
Select transactions
→ Apply Rule
```

without requiring a redesign of the import workflow.

## 11. Rules and Duplicate Detection

Both remain plugin modules.

They are explicitly **OUT OF SCOPE** for Phase 1.

```text
Import Workspace
├── Parsing
├── Normalisation
├── Account resolution
├── Manual editing
└── User approval

Future plugins
├── Rules
└── Duplicate detection
```

Do not build persistent rule-processing or duplicate-detection infrastructure as
part of this delta.

## 12. Import Approval

The import must not modify the Ledger until the user explicitly confirms it.

The summary should clearly communicate what will happen.

Example:

```text
Import Summary

35 transactions
2 new accounts

Date range
05 Apr 2026 – 10 Aug 2026

[ Import 35 transactions ]
```

If new accounts are detected:

```text
New Accounts Detected

Expense:Unknown
Income:Unknown

These accounts will be created when the import is approved.
```

The approval action commits the final edited candidates.

## 13. Commit

Only after approval:

```text
Temporary candidate transactions
        ↓
Ledger transactions
        ↓
Ledger postings
```

Committed transactions retain their originating `ImportFile` provenance.

The temporary candidate state is then discarded.

The ImportFile reference remains available through import history.

## 14. Multiple Files

Multiple files may be uploaded into the same import workspace.

Example:

```text
Files

HDFC_Apr_Aug_2026.xlsx
35 transactions

HDFC_Sep_2026.xlsx
22 transactions
```

The transaction table presents the combined candidate transaction set.

Each committed transaction retains the ID of the file from which it originated.

Example:

```text
Transaction A → ImportFile: impfile_001
Transaction B → ImportFile: impfile_001
Transaction C → ImportFile: impfile_002
```

## 15. Persistence Boundary

Persist:

- Import file reference/history
- ImportFile unique ID
- File metadata
- Final committed Ledger transactions
- Provenance from transaction to ImportFile

Do not persist:

- Parsed candidate rows
- Normalised candidate rows
- Temporary account-resolution state
- Temporary edits
- Import preview state

There is no staging transaction table in Phase 1.

## 16. Import States

The UI may represent these logical states:

```text
Uploading
Parsing
Ready for review
Importing
Completed
```

`Ready for review` is an editable workspace, not a persisted draft.

If the session is abandoned before approval, the temporary state is discarded.

## 17. Acceptance Criteria

- [ ] User can upload one or more supported files.
- [ ] Each uploaded file receives a unique ImportFile ID.
- [ ] Files are parsed and normalised into temporary candidate transactions.
- [ ] Import screen displays candidates using the existing transaction-table
      interaction/design.
- [ ] Existing transaction filters are available on the Import screen.
- [ ] Date, description, direction, amount, account and counterpart can be
      overridden before import.
- [ ] Detected accounts can be mapped to existing accounts.
- [ ] Missing accounts can be identified as new accounts.
- [ ] `Expense:Unknown` is used as the reusable Dr catch-all.
- [ ] `Income:Unknown` is used as the reusable Cr catch-all.
- [ ] Missing Unknown accounts appear under New Accounts Detected instead of
      being silently created.
- [ ] User explicitly approves the final import.
- [ ] Only approved transactions are committed to the Ledger.
- [ ] Committed transactions retain their originating ImportFile reference.
- [ ] Import history stores file-level provenance, not transaction copies.
- [ ] Abandoned imports do not remain as persistent drafts.
- [ ] Rules are not required for Phase 1.
- [ ] Duplicate detection is not required for Phase 1.
