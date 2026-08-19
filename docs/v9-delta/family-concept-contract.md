# Ledger — Family Concept Contract

**Status:** Architecture / implementation contract  
**Scope:** Family concept and family-level application behaviour  
**Relationship to v9:** Standalone supplement. Do not rewrite or renumber v9 documentation because of this file.

---

## 1. Core decision

**Family is an application-level data boundary.**

A Family is not an accounting entity and not a reporting/grouping mechanism.

Each Family represents an isolated financial dataset.

Conceptually:

```text
Application
│
├── Family A
│    └── isolated Family data
│
└── Family B
     └── isolated Family data
```

A user may have multiple Families available in the application, but financial data does not span Families.

---

## 2. Family versus Member

These are different boundaries.

### Family

Defines:

- isolated financial dataset
- application-level family selection
- database/dataset boundary

### Member

Defines:

- person/profile within the active Family
- ownership of Accounts
- ownership/context of Transactions

Conceptually:

```text
Application
└── Family
     ├── Member
     │    ├── Accounts
     │    └── Transactions
     │
     └── Member
          ├── Accounts
          └── Transactions
```

Member is therefore **not** the database boundary.

---

## 3. Family versus Space

Space is deliberately different from Family.

### Family

```text
data boundary
```

### Space

```text
context / reporting boundary
```

A Space does not own Accounts.

A Space does not create a second ledger.

A Space may later be attached to Transactions to provide a narrowed contextual view.

Example:

```text
Family
│
├── Personal accounts
├── Personal transactions
│
└── Space: Japan Trip 2026
      └── selected transactions
```

The underlying transactions remain in the Family dataset.

Space is therefore not a replacement for Family.

---

# 4. Family data isolation

Financial data must never cross Family boundaries.

If:

```text
Family A
```

is active, queries and mutations operate only against Family A's dataset.

Switching to:

```text
Family B
```

changes the active financial dataset.

There should be no normal transaction/report query such as:

```text
all transactions across all Families
```

Family switching is therefore an application-level context change.

---

# 5. Application-level Family registry

The application needs a way to know which Families exist and where their isolated datasets are located.

Conceptually:

```text
Application
│
├── Family registry
│    ├── Family A → dataset reference
│    └── Family B → dataset reference
│
└── Active Family
```

The exact persistence mechanism for the registry is an implementation decision.

The important architectural rule is:

> Family selection happens above the financial database.

Do not introduce `family_id` into every financial table merely to recreate a boundary that is already established by the selected Family dataset.

---

# 6. Active Family

Application maintains an active Family context.

Conceptually:

```text
activeFamilyId
```

or equivalent application state.

All financial modules operate against the active Family.

Examples:

```text
Track → Accounts
Track → Transactions
Dashboard
Reports
```

must use the active Family dataset.

---

# 7. Family switching

Family selector should be globally available in the application shell.

Reference pattern from the supplied FinBodhi screenshot:

```text
┌──────────────────────────────────────────┐
│ Search...       [ New Family ▼ ] [user] │
└──────────────────────────────────────────┘
```

The exact UI may differ.

Behaviour:

```text
Select Family
      ↓
change active Family
      ↓
switch financial dataset
      ↓
load Family members
      ↓
restore/select active Member
      ↓
render application
```

Do not retain stale financial data from the previous Family in active views.

---

# 8. Family screen contract

## 8.1 Family list

Purpose:

Manage Families available to the application.

Fields displayed:

```text
Family name
```

Primary action:

```text
Create Family
```

Each Family may be selected/opened.

The list is application-level, not part of a Family's accounting data.

---

## 8.2 Add Family

Only required field:

| Field | Required |
|---|---:|
| Name | Yes |

Example:

```text
Create Family

Family name
[ Amit's Family ]

[ Cancel ] [ Create ]
```

No financial fields.

Do not ask for:

- currency
- account
- member list
- reporting preferences
- transaction settings

during basic Family creation unless a later onboarding contract explicitly adds them.

---

## 8.3 Edit Family

Same form:

```text
Edit Family

Family name
[ Amit's Family ]

[ Cancel ] [ Save ]
```

Editing Family name must not change its dataset identity.

---

# 9. Family creation lifecycle

At architectural level:

```text
Create Family
      ↓
create Family identity / registry entry
      ↓
create isolated Family dataset
      ↓
initialize schema
      ↓
initialize required baseline data
      ↓
open Family
```

The exact baseline initialization belongs to the application bootstrap contract.

At minimum, Family initialization must result in a valid empty Family dataset that can be opened by the application.

Do not silently copy financial data from another Family.

---

# 10. Family opening lifecycle

When opening a Family:

```text
Family registry
      ↓
resolve dataset
      ↓
open database/dataset
      ↓
verify schema
      ↓
load members
      ↓
establish active member
      ↓
load application
```

If the Family dataset cannot be opened or is invalid, application must fail safely rather than silently opening another Family.

---

# 11. Member selection after Family switch

Family contains Members.

Therefore Family switching and Member switching are separate operations.

```text
Family
  ↓
Member
  ↓
financial views
```

Example:

```text
Switch Family
      ↓
Amit's Family
      ↓
AK
```

or:

```text
Switch Family
      ↓
Amit's Family
      ↓
PK
```

The active Member determines which member-owned financial data is shown.

---

# 12. Data model implication

If each Family has an isolated financial database/dataset, financial tables do not need a Family foreign key merely for isolation.

Conceptual Family dataset:

```text
members
currencies
accounts
transactions
postings
```

Potential future:

```text
spaces
space_members
```

The exact schema remains governed by the existing domain/data-model documentation.

### Important

Do not add:

```text
family_id
```

to every financial table unless the physical storage architecture later changes from isolated Family datasets to a shared database.

---

# 13. Member ownership remains required

Family isolation does not remove Member ownership rules.

Inside one Family:

```text
Member A
  ├── Account A
  └── Transactions A

Member B
  ├── Account B
  └── Transactions B
```

Account and transaction operations must still validate Member ownership.

For example:

```text
activeFamily
    ↓
activeMember
    ↓
Account query
```

A Member must not be able to access another Member's accounts merely because both exist in the same Family.

---

# 14. Family-level reporting

Family is not a reporting filter in the way Space is.

A Family switch changes the dataset itself.

Therefore:

```text
Family A → reports over Family A
Family B → reports over Family B
```

There is no normal cross-Family aggregate.

Inside one Family, later reports may be:

```text
all members
active member
specific Space
```

Those are reporting scopes.

Family is above those scopes.

---

# 15. Family-level deletion

Family deletion is a destructive operation because Family represents an isolated financial dataset.

The UI must treat it as destructive.

Do not implement deletion merely as hiding a Family from the selector.

If deletion is implemented, it must remove the Family dataset according to the application's storage model.

No soft-delete requirement is introduced by this contract.

If final deletion semantics are not yet implemented, leave the action out rather than inventing a partial lifecycle.

---

# 16. Family backup / export boundary

The Family is the natural boundary for financial backup/export.

Conceptually:

```text
Backup Family
      ↓
export one Family dataset
```

Do not create a single financial export that silently combines unrelated Families unless explicitly designed later.

The supplied FinBodhi backup is useful reference material for the contents of an individual financial dataset, but it does not by itself establish a Ledger backup format.

---

# 17. Reference observation: FinBodhi

The supplied FinBodhi screenshot shows:

- a Settings → Families screen
- multiple Families listed
- a Create Family action
- Family selection visible in the application shell

The supplied backup contains profile/account/transaction data for the financial dataset.

These observations support the Family-at-application-level pattern.

They do **not** by themselves establish Ledger's physical storage implementation.

Ledger's isolated-Family database decision is an architectural decision for this project.

---

# 18. What Family does NOT contain

Family is not:

- an account
- a transaction
- a posting
- a currency
- a tag
- a Space
- a settlement
- an expense category
- a reporting category

Family is the boundary containing these concepts.

---

# 19. Explicit non-goals

This contract does not define:

- authentication
- cloud account management
- Family sharing
- Family invitations
- online synchronization
- cross-Family reporting
- Space implementation
- settlement implementation
- import implementation
- audit/history
- Settings screens beyond the Family management concept

Do not infer these features from the existence of Families.

---

# 20. Architecture summary

```text
                         APPLICATION
                              │
              ┌───────────────┴───────────────┐
              │                               │
           Family A                        Family B
       isolated dataset               isolated dataset
              │
       ┌──────┴──────┐
       │             │
    Member A       Member B
       │             │
    Accounts      Accounts
    Transactions Transactions
       │
    Postings
       │
    future Spaces
```

Boundary meanings:

```text
Family  = dataset boundary
Member  = ownership boundary
Space   = contextual/reporting boundary
Account = accounting object
Transaction = financial fact
Posting = accounting entry
```

---

# 21. Core principle

> **Family separates datasets. Member separates ownership. Space narrows context.**

Do not use one concept to solve another concept's problem.
