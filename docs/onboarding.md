# Onboarding

**Status:** MVP implementation contract  
**Audience:** Frontend and application implementation  
**Related:** `design.md`, domain/architecture/ADR documents

## 1. Purpose

Onboarding establishes the first usable Ledger environment.

```text
App Account
    ↓
Family
    ├── Members
    ├── Accounts
    ├── Transactions
    └── other family-owned data
```

Members are family entities, not separate authenticated application accounts.

The onboarding flow must create a valid Family context before entering the main application.

## 2. First-Run Decision Tree

```text
App launch
    ↓
Family exists?
    │
    ├── No
    │    ↓
    │  Create Family
    │    ↓
    │  Choose:
    │    ├── Start with Demo Data
    │    └── Start from Scratch
    │
    └── Yes
         ↓
     Existing Family
         ↓
     Primary Member
         ↓
      Dashboard
```

Demo data is available **only while creating a new Family**.

There is no MVP flow for adding or merging demo data into an existing Family.

## 3. Family Creation

### Screen

```text
Create Family

Family name
[ Amit's Family              ]

[ Create Family ]
```

After Family creation:

```text
How would you like to start?

[ Start with Demo Data ]
Explore Ledger with sample data

[ Start from Scratch ]
Set up your own accounts and transactions
```

### Rules

- Family name required.
- Family is primary data boundary.
- New Family receives its own family-specific data context/database according to application architecture.
- Demo choice available only at Family creation.
- Existing Families never receive demo-data choice during normal onboarding.

## 4. Demo Data

### 4.1 Demo Dataset

Ledger ships with native demo content.

Minimum:

```text
1 Family
2 Members
INR currency
```

Accounts:

### Income

```text
Salary
Freelance
```

### Assets

```text
Bank 1
Bank 2
Stock 1
Stock 2
Metal 1
Mutual Fund 1
Mutual Fund 2
```

### Liabilities

```text
Home Loan
Credit Card
```

### Expenses

Several useful expense accounts/categories.

### Balancing

```text
1 Balancing account
```

### Transactions

Approximately:

```text
1,000+ transactions
```

covering approximately one year and touching all relevant accounts.

Representative activity should include:

```text
Income
Expenses
Transfers
Credit card spending
Credit card payment
Loan activity
Interest
Bank transfers
Stock transactions
Mutual fund transactions
Metal transactions
Split transactions
Tags
Activity involving multiple members
```

Demo data should be realistic and useful for exploring the application, not meaningless random rows.

### 4.2 Demo Copy Semantics

Demo data is a starting dataset, not a special mode.

```text
Demo template
    ↓
New Family
    ↓
Normal Family-owned data
```

Copied records behave exactly like user-created records.

Users can edit or delete demo records normally.

Do not require ongoing `isDemo` semantics throughout the application.

### 4.3 Demo Isolation

Demo data must never modify the shipped/native template.

```text
Immutable demo source
        ↓
copy
        ↓
Family-specific data context
```

IDs and relationships must be valid in the new Family context.

## 5. Start From Scratch

If the user chooses Start from Scratch:

```text
Family
Members
INR
```

are established, but no demo accounts or transactions are created.

User enters the normal application with an empty ledger.

Empty states should guide toward:

```text
Add Account
Add Transaction
```

## 6. Members

At least one Member is required during initial Family setup.

```text
Family Members

Member name
[ ... ]

[ Add Member ]

Members
  Amit
  PK

[ Continue ]
```

User may add additional Family members but is not required to.

### Rules

- Member belongs to exactly one Family.
- Member owns Accounts and Transactions through the domain model.
- Members do not require separate registration.
- Members do not require separate login credentials.
- Member switching changes active financial context.
- Multiple Members may exist in one Family.

## 7. Primary Member

Primary Member is the default Member used when entering an existing Family.

### One Member

If only one Member exists, select it automatically. No extra question.

### Multiple Members

```text
Who is the primary Member?

○ Amit
○ PK
```

Selected Member becomes default active Member.

Important distinction:

```text
Application authentication identity
        ≠
Family Member
```

A Member is not automatically an independently authenticated application user.

## 8. Currency

MVP uses INR.

INR should be automatically available for the Family/member context according to the current currency architecture.

Preferred onboarding behaviour:

```text
Create Family
    ↓
INR available automatically
```

Do not add an unnecessary currency-selection step.

No multi-currency onboarding is required for MVP.

## 9. Existing Family

If a Family already exists and its data context/database is available:

```text
Application start
    ↓
Family available
    ↓
Primary Member
    ↓
Dashboard
```

Primary Member is selected automatically.

Do not show first-run onboarding again.

Family and Member switching remain available through the normal application shell.

## 10. Resume / Interrupted Onboarding

Onboarding must tolerate interruption.

Examples:

```text
Family created
but Members not created

Family + Members created
but demo copy interrupted

Family created
but setup not completed
```

The application must determine setup state and resume from the appropriate point.

Where possible, setup operations should be atomic.

Do not intentionally leave partially-created accounting data behind.

## 11. Clean Up Content

Provide a **Clean Up Content** action for the Family.

Primary use case:

```text
Demo Family
    ↓
Explore demo
    ↓
Clean Up Content
    ↓
Empty Family
```

### Behaviour

Clean Up Content deletes all family-owned financial content while preserving:

```text
Family
Members
```

It must delete relevant:

```text
Accounts
Transactions
Postings
and other family-owned financial data
```

according to the current domain model.

It must **not** delete Family or Members.

### Members are not deleted

Members must be deleted manually.

Therefore:

```text
Clean Up Content
    ↓
Family remains
Members remain
Financial data removed
```

If a Member must be removed, use explicit Member deletion.

### Cleanup confirmation

```text
Clean up content?

This will permanently delete all accounts,
transactions, postings, and other financial data
in this Family.

Your Family and Members will remain.

[ Cancel ]    [ Clean Up Content ]
```

Use hard delete consistent with MVP architecture.

No soft-delete/history mechanism is required for cleanup.

### After cleanup

```text
Content cleaned up.

Your Family and Members are still here.
You can now start adding your own accounts.
```

Do not recreate demo data automatically.

To use demo data again in MVP, create a new Family and choose Start with Demo Data.

There is no:

```text
Restore Demo Data
Import Demo Data
Merge Demo Data
```

flow in MVP.

## 12. Onboarding States

Implementation should represent these behavioural states:

```text
NEW
FAMILY_CREATED
SETUP_PATH_SELECTED
MEMBERS_CREATED
PRIMARY_MEMBER_SELECTED
READY
```

Demo path may additionally require:

```text
DEMO_COPYING
DEMO_COPY_FAILED
```

Exact persisted representation may follow application architecture.

## 13. Failure Handling

### Family creation failure

Do not continue into Member setup.

### Member creation failure

Do not mark onboarding complete.

### Demo copy failure

Do not present Family as fully initialized.

Provide retry/resume behaviour.

### Database/data-context unavailable

Do not silently create a second unrelated Family database.

Show an actionable recovery state.

## 14. Onboarding Completion

Final step should be lightweight.

Normal:

```text
You're ready.

Amit's Family
2 Members
INR

[ Go to Dashboard ]
```

Demo:

```text
You're ready.

Amit's Family
2 Members
INR
1,000+ Transactions

[ Explore Dashboard ]
```

Do not add unnecessary tutorials.

## 15. Clean Start Principle

After onboarding, both paths use exactly the same application:

```text
User-created Family
        OR
Demo-created Family
```

There is no separate Demo UI, transaction screen, account screen, or dashboard.

Demo content only populates a realistic Family.

## 16. Explicit MVP Non-Goals

Do not implement:

- Demo data import into an existing Family.
- Demo data merge.
- Demo data restore after cleanup.
- Demo-data-specific application behaviour.
- Separate Member registration.
- Separate Member passwords/login.
- Multi-currency onboarding.
- Multi-currency MVP behaviour.
- Automatic Member deletion during cleanup.
- Soft delete for cleanup.
- Transaction history/audit UI as part of onboarding.
- Unrelated onboarding tutorials.

## 17. Acceptance Criteria

### New Family

- [ ] User can create a Family.
- [ ] User chooses Start with Demo Data or Start from Scratch.
- [ ] Demo choice exists only during Family creation.
- [ ] At least one Member can be created.
- [ ] Additional Members can be added.
- [ ] Single Member is automatically primary.
- [ ] Multiple Members allow primary Member selection.
- [ ] INR is available without multi-currency setup.
- [ ] User reaches Dashboard after successful setup.

### Demo

- [ ] Native demo dataset ships with application.
- [ ] Demo contains one Family and two Members.
- [ ] Demo contains representative account types.
- [ ] Demo contains approximately 1,000+ transactions across approximately one year.
- [ ] Demo transactions touch all relevant accounts.
- [ ] Copied demo records become normal Family-owned data.
- [ ] Demo template remains unchanged.
- [ ] Demo data cannot be added to an existing Family.

### Existing Family

- [ ] Existing Family skips first-run Family creation.
- [ ] Primary Member is selected by default.
- [ ] User enters normal application directly.

### Cleanup

- [ ] Clean Up Content is available for a Family.
- [ ] Cleanup deletes financial content.
- [ ] Family survives cleanup.
- [ ] Members survive cleanup.
- [ ] Members require explicit manual deletion.
- [ ] Cleanup requires destructive confirmation.
- [ ] Cleanup uses hard delete.
- [ ] Demo data is not automatically restored.

### Recovery

- [ ] Interrupted onboarding can resume.
- [ ] Failed demo copy does not produce a falsely-ready Family.
- [ ] Setup operations do not intentionally leave partial accounting data.
