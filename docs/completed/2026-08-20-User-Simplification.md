# 2026-08-20 — User Simplification

## Objective

Simplify Ledger's user/domain model before moving to Instrument, Quantity, and Pricing work.

Ledger is a self-hosted, single-instance personal finance application. The current model should not behave like a multi-tenant SaaS product with independent Families.

The core identity concepts are:

- **AppUser** — a registered person who can log in.
- **Profile** — the person/entity whose finances are tracked.

Spaces are explicitly deferred to a later phase.

## Scope

### In scope

1. Remove the Family concept from the active domain model.
2. Treat one Hosted Instance as the complete private financial environment.
3. Keep one database per Hosted Instance.
4. Establish a strict 1:1 relationship between AppUser and Profile when an AppUser exists.
5. Allow Profiles to exist without an AppUser.
6. Make the first AppUser the Primary User.
7. Allow the Primary User to create/manage multiple additional Profiles.
8. Restrict a normal AppUser to their own Profile.
9. Support linking an existing unregistered Profile to an AppUser when that person later registers.
10. Preserve the existing financial/accounting model underneath Profiles.

### Explicitly out of scope

- Spaces
- Space participants
- OTP/magic-link Space authentication
- Shared-expense collaboration
- Space transaction linking
- Multi-family / multi-tenant support
- Separate database per Family
- Encryption
- Sync
- Backup/recovery implementation
- Instrument discovery
- Quantity/price model
- Pricing APIs

## 1. Hosted Instance

Ledger is single-tenant at the deployment level.

```text
Hosted Instance
└── ledger.db
```

One Hosted Instance represents one private Ledger environment.

There is no requirement to onboard unrelated Families or independent financial tenants into the same instance.

The database remains:

```text
1 Hosted Instance → 1 database
```

Family-level physical database isolation is removed from the current design.

Future encryption/sync/backup requirements must not be blocked by this decision, but their implementation is not part of this delta.

## 2. AppUser

An AppUser is a registered application user with login credentials.

### Invariant

```text
1 AppUser ↔ exactly 1 Profile
```

Therefore:

- Every AppUser must have exactly one Profile.
- An AppUser cannot exist without a Profile.
- An AppUser cannot own multiple Profiles.
- The Profile associated with an AppUser is the user's own financial Profile.

When an AppUser registers for the first time, their Profile is created automatically.

```text
John registers
    ↓
AppUser: John
    ↓
Profile: John
```

## 3. Profile

A Profile represents a person whose finances are tracked.

A Profile may exist without an AppUser.

```text
Profile
├── Accounts
├── Transactions
└── Insights
```

Examples:

```text
John
Jenny
Father
Mother
Child
```

The Primary User can create Profiles for other people without requiring those people to register.

### Profile/AppUser relationship

```text
AppUser → exactly 1 Profile
Profile → 0 or 1 AppUser
```

An existing Profile must be linkable to an AppUser later without creating a second Profile.

## 4. Primary User

The first AppUser created in a Hosted Instance becomes the Primary User.

The Primary User has their own automatically-created Profile.

```text
AppUser: John
Role: PRIMARY
Profile: John
```

The Primary User can:

- manage their own Profile
- create additional Profiles
- manage additional Profiles
- record transactions for their own Profile
- record transactions on behalf of other Profiles
- switch between Profiles when recording/managing financial data
- view broader instance-level information according to the application's permission model

The Primary User must not create another Profile for themselves.

Their existing AppUser/Profile relationship remains 1:1.

## 5. Normal AppUser

A normal registered AppUser also has exactly one Profile.

```text
AppUser: Jenny
Profile: Jenny
Role: MEMBER
```

A normal AppUser:

- can log in
- can manage their own financial data
- can create/edit their own transactions
- can view their own insights
- cannot switch to another Profile
- cannot record transactions on behalf of another Profile

The Primary User can continue recording transactions on behalf of the normal user's Profile.

Registration does not remove the Primary User's ability to manage that Profile.

## 6. Profile Registration Lifecycle

A Profile can begin without an AppUser and later become associated with one.

### Initial state

```text
John
├── AppUser: John
└── Profile: John

Jenny
├── AppUser: none
└── Profile: Jenny
```

John can track Jenny's finances.

### Later registration

Jenny registers using an invitation/link provided by John.

The existing Profile is linked:

```text
Existing Profile: Jenny
          ↓
     Jenny registers
          ↓
AppUser: Jenny
          │
          └── Profile: Jenny
```

Do not create a second Jenny Profile.

The resulting invariant remains:

```text
John AppUser  ↔ John Profile
Jenny AppUser ↔ Jenny Profile
```

## 7. Example End-to-End Flow

### Initial setup

John registers.

```text
AppUser: John
Profile: John
Role: PRIMARY
```

John creates a Profile for Jenny.

```text
Profile: Jenny
AppUser: none
```

John can now record transactions for both John and Jenny.

Jenny has no login yet.

### Jenny registers later

John provides Jenny with the registration/invitation link.

Jenny registers.

The existing Jenny Profile is linked to the newly-created AppUser.

```text
AppUser: Jenny
       ↕
Profile: Jenny
```

Jenny can now log in and manage her own finances.

John can still record transactions on Jenny's behalf.

## 8. Remove Family Concepts

The following concepts are no longer part of the current Ledger domain:

- Family
- Family membership
- Family roles
- Family-level database
- Family-level tenant isolation

Do not replace Family with another equivalent ownership container.

The Hosted Instance itself is the privacy/deployment boundary.

Profiles provide the financial-person boundary.

Profile Groups/Tags, if present or introduced later, are analytical grouping mechanisms rather than ownership/security boundaries.

## 9. Data Isolation

### Instance boundary

```text
Hosted Instance
    ↓
Complete private Ledger environment
```

### Profile boundary

```text
Profile
    ↓
Accounts
Transactions
Insights
```

### User permission boundary

```text
Primary AppUser
    ↓
Can manage multiple Profiles

Normal AppUser
    ↓
Own Profile only
```

The application should not infer permissions merely from whether a Profile has an AppUser.

The Primary User's role determines the ability to operate across Profiles.

## 10. Migration / Implementation Considerations

Before implementation is considered complete:

1. Remove Family entities/references from the active domain model.
2. Remove Family IDs from entities where they only existed to support the obsolete Family boundary.
3. Establish the AppUser → Profile 1:1 constraint.
4. Ensure Profile → AppUser remains optional.
5. Ensure first-run registration automatically creates the Primary user's Profile.
6. Ensure Primary User can create additional Profiles.
7. Ensure additional Profiles can remain unregistered.
8. Ensure an existing Profile can be linked to a newly registered AppUser.
9. Prevent duplicate Profiles from being created during that linking flow.
10. Preserve existing Accounts and Transactions associated with the Profile.
11. Update UI, navigation, permissions, validation, and onboarding flows to remove Family terminology.
12. Do not introduce Space implementation as part of this change.

If an existing development database contains Family-related data, migration should preserve financial records while removing/replacing the obsolete Family abstraction according to the current implementation.

## Acceptance Criteria

### Identity

- [ ] Registering the first user creates an AppUser and exactly one Profile.
- [ ] The first AppUser is marked Primary.
- [ ] An AppUser cannot exist without a Profile.
- [ ] An AppUser cannot have more than one Profile.
- [ ] A Profile can exist without an AppUser.
- [ ] A Profile cannot be linked to more than one AppUser.

### Primary User

- [ ] Primary User can create additional Profiles.
- [ ] Primary User cannot create a second Profile for themselves.
- [ ] Primary User can record transactions for their own Profile.
- [ ] Primary User can record transactions for other Profiles.
- [ ] Primary User can switch between Profiles where required by the existing UI flow.

### Normal User

- [ ] Normal AppUser has exactly one Profile.
- [ ] Normal AppUser can access their own financial data.
- [ ] Normal AppUser cannot switch to another Profile.
- [ ] Normal AppUser cannot record transactions for another Profile.

### Registration of an existing Profile

- [ ] A Profile can exist before its person registers.
- [ ] The person can register later.
- [ ] Registration links the existing Profile to the new AppUser.
- [ ] Registration does not create a duplicate Profile.
- [ ] Existing Accounts and Transactions remain associated with the same Profile.
- [ ] Primary User retains the ability to manage that Profile.

### Architecture

- [ ] One Hosted Instance uses one database.
- [ ] Family/multi-family concepts are removed from the active model.
- [ ] No per-Family database is introduced.
- [ ] Spaces are not implemented in this delta.

## Resulting Domain Model

```text
Hosted Instance
│
├── AppUsers
│     │
│     └── 1:1 Profile
│
├── Profiles
│     │
│     ├── Accounts
│     ├── Transactions
│     └── Insights
│
└── Profile Groups / Tags
      └── analytical grouping only
```

The fundamental model is:

```text
AppUser
  = registered/login identity

Profile
  = financial identity

Hosted Instance
  = privacy/deployment boundary
```

Spaces, shared-expense collaboration, and external participants are intentionally deferred to a later phase.
