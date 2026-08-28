# Delta: Import Framework & Account Resolution

**Date:** 2026-08-26  
**Status:** Ready for implementation  
**Scope:** Import UX, adapter framework, HDFC account XLS adapter, account identification/resolution

## 1. Purpose

Build the first usable import workflow for Ledger.

The importer converts external financial statements into normalized transaction candidates, allows the user to review and override them, and commits them to the Ledger only after explicit approval.

The first concrete source adapter is `hdfc.account.xls`.

The architecture must support additional institution/product/format adapters without making the import pipeline institution-specific.

## 2. Import landing page

The `/imports` page has two sections.

### 2.1 Top section: Import action

Provide:

- Page title: `Imports`
- Short explanation of the import workflow
- Primary CTA: `New Import`
- Optional information cards only when genuinely useful

Do not turn this into another dashboard.

### 2.2 Previous imports

Below the action section, show a read-only list of previous imports.

This is **import history**, not a transaction list.

Each row represents one imported file/import reference.

Display:

- Imported date/time
- File name
- Resolved account
- Number of transactions
- Number of new accounts identified
- Total inflow
- Total outflow
- Status

Example:

| Imported | File | Account | Transactions | New Accounts | Inflow | Outflow | Status |
|---|---|---|---:|---:|---:|---:|---|
| 26 Aug 2026 | HDFC_Aug_2026.xls | HDFC Investment ••66 | 35 | 0 | ₹5,97,326.56 | ₹8,94,350.00 | Successful |
| 20 Aug 2026 | HDFC_Jul_2026.xls | HDFC Investment ••66 | 42 | 1 | ₹4,21,000.00 | ₹3,85,200.00 | Successful |

Allowed statuses:

- `Successful`
- `Failed`

Do not expose `Committed`, `Approved`, or similar accounting workflow states in import history.

Previous import records are informational only. No edit, delete, retry, or re-import action is required from this list.

## 3. New Import workflow

The workflow must **not require the user to select an account before uploading the file**.

The statement should be used to identify the account wherever possible.

```text
New Import
    ↓
Upload file(s)
    ↓
Detect adapter
    ↓
Parse
    ↓
Normalize
    ↓
Detect institution / statement type / account
    ↓
Resolve account
    ↓
Import preview
    ↓
User edits / confirms
    ↓
Approve
    ↓
Commit to Ledger
```

The user can override the resolved account.

No drag-and-drop requirement for Phase 1. A normal file picker is sufficient.

## 4. Import lifecycle

The conceptual lifecycle remains:

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

Parsed and normalized transaction candidates are **transient**.

Do not create a persistent staging table for import candidates in Phase 1.

If the user closes the page, refreshes, abandons the import, or does not approve it, the temporary import data can be lost.

Persistent data is created only after approval:

1. Ledger transactions/postings
2. File-level import history/reference

## 5. Adapter architecture

Adapters are organized as:

```text
Institution
    └── Statement / Product Type
          └── Format
```

Example:

```text
HDFC
├── Account
│   ├── XLS
│   ├── CSV
│   └── PDF
└── Credit Card
    └── PDF
```

Adapter identifiers should therefore look like:

```text
hdfc.account.xls
hdfc.account.csv
hdfc.account.pdf
hdfc.creditcard.pdf
```

Do not create one giant `hdfc` adapter.

Do not organize adapters primarily by file extension.

The institution and financial product determine the statement semantics; the format determines how that statement is parsed.

## 6. Adapter responsibilities

An adapter is responsible only for converting a source file into the application's normalized import representation.

It is responsible for:

- recognizing the expected source structure
- parsing the source file
- extracting statement metadata
- extracting source account identity
- extracting transaction dates
- extracting descriptions/narrations
- extracting debit/credit direction
- extracting amounts
- producing normalized transaction candidates

An adapter must not:

- create Ledger accounts
- create Ledger transactions
- apply import rules
- perform duplicate detection
- perform transaction categorization intelligence
- commit transactions
- decide final accounting treatment beyond normalized debit/credit information

Those are generic import/Ledger responsibilities.

## 7. HDFC Account XLS adapter

Implement the first concrete adapter:

```text
hdfc.account.xls
```

Use real HDFC XLS statement files as fixtures for development and regression testing.

The adapter must inspect the actual HDFC workbook structure rather than expecting generic normalized columns.

The adapter converts HDFC-specific columns and values into the normalized import representation.

Tests should cover representative HDFC transactions including:

- debit transactions
- credit transactions
- transfers
- UPI
- NEFT/IMPS
- bank charges
- interest
- opening/closing information where present
- account identification

Use multiple HDFC statements where possible, especially statements from different accounts.

## 8. Adapter detection

After file upload, the importer attempts to determine the appropriate adapter.

Detection may use:

- file format
- workbook/sheet structure
- column headers
- known institution markers
- statement metadata
- other source-specific characteristics

Example:

```text
HDFC_Aug_2026.xls
        ↓
HDFC Account XLS detected
        ↓
hdfc.account.xls
```

If an adapter cannot be confidently identified, do not silently use an incorrect adapter.

The user should be given an appropriate fallback such as generic parsing/manual source selection.

## 9. Normalized import representation

Adapters should produce a common normalized representation.

Conceptually:

```yaml
source:
  institution: HDFC
  statement_type: account
  adapter: hdfc.account.xls

account:
  identifier: XXXXXX66
  identifier_type: masked_account_number

transactions:
  - date: 2026-08-05
    description: "UPI/... "
    direction: debit
    amount: 500
```

The normalized representation should retain source information useful for review and traceability.

The adapter should not convert the transaction directly into `Expense:Food` or `Income:Salary` unless such classification is explicitly part of the generic import rules in a future phase.

## 10. Account identification

Account identification is part of the import pipeline.

The importer should attempt to extract an account identifier from the statement.

Examples:

```text
2233445566
XXXXXX66
XX66
XXX66
```

The identifier found in the statement is a **source representation**, not necessarily the exact canonical account number stored elsewhere.

Account display name is not an account identity.

For example:

```text
Account name:
HDFC Investment Account

Known identity:
2233445566
```

The user may later rename it to:

```text
HDFC Long Term Investments
```

The account must continue to resolve to the same Ledger account.

## 11. AccountIdentifier entity

Do not store account identifiers as a JSON/list property on `Account`.

Introduce a separate child entity:

```text
Account
    1 ─────── N
AccountIdentifier
```

Conceptually:

```text
Account
---------
id
name
type
currency
...

AccountIdentifier
-----------------
id
account_id
identifier
```

An account can therefore have multiple known representations:

```text
HDFC Investment Account
    ├── 1234566
    ├── XX66
    └── XXX66
```

The identifier should be independently queryable and indexed for account resolution.

The same identifier must not resolve to multiple accounts within the relevant instance/account scope.

## 12. Account identifier matching

When an imported statement contains an identifier such as `XXX66`, the importer first attempts an exact match against known `AccountIdentifier` records.

Example:

```text
Existing account:

HDFC Investment Account
    1234566
    XX66
    XXX66
```

Then:

```text
Statement: XXX66
→ Existing account
```

Likewise:

```text
Statement: XX66
→ Existing account

Statement: 1234566
→ Existing account
```

The user's account name is irrelevant to this matching.

## 13. New identifier / possible match

A newly observed identifier should not immediately create a new account if it appears to be a possible representation of an existing account.

Example:

```text
Existing:

HDFC Investment Account
    1234566
    XX66
    XXX66

Statement:

XXXXX66
```

If the resolver determines that `XXXXX66` is a possible representation of the existing account, present it to the user as a **possible match**.

Example:

```text
Possible existing account

Statement identifier:
XXXXX66

Possible match:
HDFC Investment Account
Known identifiers: XX66, XXX66, 1234566

[Use existing account]
[Create new account]
```

Do not automatically merge the identifier.

## 14. User-approved identifier learning

If the user approves the possible match, the new representation is added to the existing account's `AccountIdentifier` records.

Result:

```text
HDFC Investment Account
    ├── 1234566
    ├── XX66
    ├── XXX66
    └── XXXXX66
```

Future statements containing `XXXXX66` can then resolve directly.

This is deterministic user-approved learning, not an intelligence/ML system.

## 15. Ambiguous account resolution

If a source identifier could correspond to multiple accounts, do not guess.

Example:

```text
Statement:
XXXX66

Possible existing accounts:

HDFC Investment Account ••66
HDFC Savings Account    ••66
```

The importer must require user resolution.

## 16. New account handling

If no existing account matches the detected identifier, show it as a **new account detected**.

Do not silently create the account merely because it appeared in a statement.

The user must be able to:

- map it to an existing account
- or create/confirm a new account

The import landing page's `New Accounts` count reflects accounts detected during the import.

## 17. Unknown transaction handling

When the imported statement provides no reliable accounting classification:

```text
Debit  → Expense:Unknown
Credit → Income:Unknown
```

These are catch-all accounts.

Do not create a new Unknown account for every imported transaction.

If the relevant Unknown account does not exist, the importer should show it as a required/new account during account resolution.

For credit-card statements, a credit shown by the source remains a **credit/income-side normalized event** at import stage. The user can determine the appropriate final account treatment during review.

## 18. Import preview

The import preview is the main review screen.

It should use the same general transaction-list language and interaction patterns as the normal Transactions page.

The imported rows are editable before approval.

The user can override imported values including:

- date
- debit/credit
- description
- amount
- account

If the importer has detected a new or incorrect account, the user can change it and map it to an existing account.

The preview remains an import-specific workflow; nothing reaches the Ledger until approval.

## 19. Rules and duplicate detection

Keep these as plugin modules.

They are **not part of Phase 1 implementation**.

The conceptual future pipeline remains:

```text
Upload
  ↓
Parse
  ↓
Normalize
  ↓
Rules               [plugin]
  ↓
Account Resolution
  ↓
Duplicate Detection [plugin]
  ↓
Import Preview
  ↓
Approval
  ↓
Commit
```

Phase 1 should establish the extension points without implementing these plugins.

## 20. Import history and transaction references

Every imported file gets a unique import/file ID.

The persistent import history record contains file-level information, such as:

```text
import_id
file_name
imported_at
account_id
transaction_count
new_account_count
inflow
outflow
status
```

The resulting committed transactions must retain a reference to the originating import/file ID.

The history table does **not** contain one record per imported transaction.

## 21. Out of scope

Not part of this delta:

- Drag-and-drop upload
- Rules implementation
- Duplicate detection implementation
- AI/intelligent categorization
- Automatic merchant classification
- API-based imports
- HDFC credit-card adapter
- Other bank adapters beyond establishing the framework
- Persistent staging of preview transactions
- Advanced import history management

## 22. Phase 1 success criteria

The following should work end-to-end:

```text
HDFC XLS
   ↓
hdfc.account.xls
   ↓
Parse actual HDFC structure
   ↓
Extract account identifier
   ↓
Resolve existing HDFC account
   ↓
Normalize debit/credit transactions
   ↓
Apply Unknown fallback where required
   ↓
Show editable import transaction table
   ↓
User confirms/overrides
   ↓
Approve
   ↓
Ledger transactions created
   ↓
Import history record created
   ↓
Transactions reference import_id
```

The architecture should make adding:

```text
icici.account.xls
icici.account.pdf
hdfc.creditcard.pdf
```

a matter of adding adapters rather than changing the core import workflow.
