# Clinic Management System

A local full-stack clinic workspace built with Next.js, NestJS, PostgreSQL and Prisma. The original architecture illustration is available in `index.html`.

## Implemented modules

| Module | Available workflows |
| --- | --- |
| Patient desk | Register/search patients, open outpatient/inpatient visits, update visit status and inspect workflow history |
| Triage | Record temperature, blood pressure, pulse, weight, oxygen saturation and assessment notes |
| Clinical records | Append visit assessments, diagnoses and treatment plans |
| Laboratory | Request tests and record final results; finalized results cannot be overwritten |
| Pharmacy | Prescribe a medicine batch and dispense once, with automatic stock deduction and usage history |
| Inventory / procurement | Receive batches, record stock adjustments, track expiry dates and reorder levels |
| Billing | Create visit charges and record partial/full payments in KES, with unique receipt references |
| Recovery | Record nursing observations and recovery care |
| Catering | Record meal orders, diets and restrictions |
| Appointments | Book a future appointment and mark it attended or cancelled |
| Patient portal | Clinic-provisioned patient login with access to their own visits, finalized results, prescriptions, appointments and balances |
| Accounting | Record categorized expenses with unique references and view collections less expenses |
| Administration | Create role-assigned staff accounts, deactivate accounts and inspect audit entries |
| Reports | Patient/visit counts, recorded collections by method, outstanding balances, pending tests, appointments and low-stock/expiry alerts |

Departments are under **Departments & administration** after signing in. Actions and records are restricted by staff role on the API as well as in the interface. Clinical notes are append-only. Successful changes create audit entries in the same transaction. Billing and stock mutations use serializable transactions; conflicts return an instruction to refresh and retry. Money is stored as integer cents.

## Role access

Role permissions are defined once in `packages/access` and used by both the API and workspace.

| Role | Access |
| --- | --- |
| Super administrator / clinic administrator | All departments, patient registration, visits and staff administration |
| Receptionist | Register patients, open visits, search, view and edit patient records. No patient deletion, department tabs or visit status changes |
| Clinician 1, 2 or 3 | Clinical records, Laboratory, Pharmacy stock, Stock usage history, Recovery |

Clinicians can add clinical notes and request laboratory tests. Pharmacy stock, stock usage history and recovery are view-only for clinicians. Prescribing is available within **Clinical records**, with dispensing reserved for pharmacy staff. Other specialist roles retain their department access.

In **Departments & administration ? Staff administration**, an administrator can create accounts with assigned roles or use **Save role** on an existing staff account. Role changes are audited and enforced by the API on the next request, including for users with existing sessions. Refresh or sign in again to update the visible navigation. Only a super administrator may assign/manage clinic administrators; nobody can change their own role, a super administrator's role, or convert a patient account into staff.

## Add employees and assign passwords

Administrators can click **Employees** in the top workspace navigation, or **Departments & administration → Employees & accounts**.

Enter the employee's first name, last name and login email, select their role (including Clinician 1/2/3, receptionist, accountant and specialist roles), then set and confirm a password of at least 14 characters. **Generate password** fills a generated password and its confirmation. Click **Create employee login**, then use **Show** or **Copy login details** in the success card to share the assigned credentials directly with that employee. Credentials remain only in the current page state and disappear when dismissed or when leaving the page. Password hashes stay on the server and existing passwords are never listed.

The employee directory supports name/email search and role/status filters. Use **Edit details** to update names and login email, **Save role** to change department access, **Reset password** to assign new credentials, and **Reactivate** to restore an inactive account. Password resets and deactivation invalidate previous sessions; reactivation does not restore old sessions. **Delete account** requires typing the account email: unused accounts are permanently deleted, while accounts linked to clinic activity are deactivated so their history is preserved. Own accounts and protected administrator accounts cannot be changed through these employee actions. A **Patient portal account** option also lets administrators provision a patient login linked to a recent patient record.

## Management reports

Boss and administrator accounts can open **Reports** directly from the workspace navigation, or **Departments & administration → Reports**. Accountants also have report access. Receptionists and clinicians cannot access this page or its API.

Select **From date** / **To date**, use **Today**, **This month**, or **All dates / reset**, then **Apply filters**. Dates include the entire selected day in Africa/Nairobi time. Visit status filters visits and distinct patients served, care department filters care entries, and collection method filters recorded collections. Other period totals retain their own date basis (registration, charge/payment creation, expense incurred date, prescription dispensing, or appointment schedule). Outstanding balances cover all dates and payment methods; stock alerts show current inventory. Download the displayed aggregates with **Download CSV**.

The API accepts `GET /operations/reports?from=YYYY-MM-DD&to=YYYY-MM-DD&status=COMPLETED&department=CLINICAL&method=CASH`. Every filter is optional. Invalid dates, reversed ranges and unknown filter values return a validation error.

## Requirements

- Node.js 20+ (Node.js 22 is used by CI and containers)
- PostgreSQL 14+; alternatively Docker with Compose

## Local setup

1. Copy `.env.example` to `.env`. Configure `DATABASE_URL`, a random `JWT_SECRET` of at least 32 bytes, and a unique bootstrap administrator password of at least 14 characters. Never commit `.env`.
2. Create the database/user specified by `DATABASE_URL`. To start just the provided PostgreSQL container, set a strong URL-safe `POSTGRES_PASSWORD` in `.env`, match that password in `DATABASE_URL`, and run `docker compose up -d db`.
3. Install dependencies and initialize the database:

   ```powershell
   npm.cmd install
   npm.cmd run db:generate --workspace @cms/api
   npm.cmd run db:deploy --workspace @cms/api
   npm.cmd run db:seed --workspace @cms/api
   ```

4. Start both applications:

   ```powershell
   npm.cmd run dev
   ```

The workspace is at `http://localhost:3000`; the API is at `http://localhost:3001/api/v1`. Sign in using `CMS_BOOTSTRAP_ADMIN_EMAIL` and `CMS_BOOTSTRAP_ADMIN_PASSWORD`. Seeding creates a missing administrator without changing an existing account's password. Use staff administration to create departmental accounts. To provision a patient portal account, choose the PATIENT role and link the patient record. The same sign-in page opens the patient portal for those accounts.

Use `npm` in shells where it runs directly; `npm.cmd` also works when Windows PowerShell blocks `npm.ps1`.

## Containers

After configuring `.env` including `POSTGRES_PASSWORD`, run:

```powershell
docker compose up --build -d
```

Compose waits for PostgreSQL, applies migrations, seeds the administrator, then starts the API and web application. Data persists in the `cms_database` volume. Ports bind to localhost. The browser API address is embedded at build time through `NEXT_PUBLIC_API_URL`; rebuild the web image after changing it. These containers are a local deployment configuration; public hosting requires HTTPS, correct origins and secure secret management. The production session cookie requires HTTPS.

## API

Password recovery sends a six-digit code to the account's email address. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` in `.env` to enable it. Gmail requires two-step verification and a Google app password; use `smtp.gmail.com` on port `465`. Codes expire after ten minutes, allow at most five attempts, and are single-use. Resetting a password signs out existing sessions. Apply the database migrations after updating.

All routes below are relative to `/api/v1`; authenticated requests use the session cookie.

- Authentication: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/password`
- Health: `GET /health/live`, `GET /health/ready`
- Patients: `GET /patients?search=&page=&pageSize=`, `GET /patients/:id`, `POST /patients`
- Visits: `GET /visits?status=`, `POST /visits`, `POST /visits/:id/status`, `GET /visits/:id/history`
- Department lists: `GET /operations/:area`, where area is `care`, `labs`, `stock`, `prescriptions`, `invoices`, `movements`, `appointments`, `expenses`, `staff` or `audit`
- Care: `POST /operations/care` with `visitId`, `department`, `summary`, `details`. Departments: `TRIAGE`, `CLINICAL`, `RECOVERY`, `CATERING`
- Laboratory: `POST /operations/labs`, `POST /operations/labs/:id/result`
- Stock: `POST /operations/stock`, `POST /operations/stock/:id/movements`
- Pharmacy: `POST /operations/prescriptions`, `POST /operations/prescriptions/:id/dispense`
- Billing: `POST /operations/invoices`, `POST /operations/invoices/:id/payments`
- Appointments: `POST /operations/appointments`, `POST /operations/appointments/:id/status`
- Employee editing: `PATCH /operations/staff/:id`, `DELETE /operations/staff/:id`, `POST /operations/staff/:id/password`, `POST /operations/staff/:id/reactivate`
- Staff: `POST /operations/staff`, `POST /operations/staff/:id/deactivate`, `POST /operations/staff/:id/role`
- Accounting: `POST /operations/expenses`
- Patient portal: `GET /operations/portal` (patient role; ownership is resolved from the session)
- Reports: `GET /operations/reports`
- Inpatient: `/workflows/beds`, `/workflows/clinicians`, `/workflows/admissions`, with transfer/discharge under `/workflows/admissions/:id`
- Encounter charts and amendments: `/workflows/chart/:visitId`, `/workflows/care/:id/amendments`, `/workflows/labs/:id/amendments`
- Payment reversal: `POST /workflows/payments/:id/reverse`

Visit, patient and stock selectors query the database with pagination. Department lists return 50 records by default and up to 100 per page. Reports aggregate the complete database. Payments accept `CASH`, `MPESA_RECORDED` or `BANK_RECORDED` and integer `amountCents`.

## Validation

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Service tests cover role checks, payments, dispensing, stock adjustments, closed visits, final results and concurrent workflow changes. To run the PostgreSQL integration workflow, point `DATABASE_URL` at a disposable database whose name ends in `_test`, apply migrations, then run:

```powershell
$env:CMS_TEST_DATABASE = 'true'
npm.cmd run test:integration --workspace @cms/api
```

With the local API running, `npm.cmd run verify:access --workspace @cms/api` checks administrator, receptionist and all three clinician roles over HTTP using temporary accounts and patient records, then removes those records. It also verifies that role changes apply to existing sessions.

The integration test creates its own identified records and removes those records afterward. CI provisions PostgreSQL, applies migrations, runs both test suites and builds both applications.

`npm.cmd run test:integration:full --workspace @cms/api` also covers HTTP authorization, amendments, payment reversals, and concurrent bed assignment. It requires a disposable PostgreSQL database ending in `_test` and `CMS_TEST_DATABASE=true`.

Create and inspect backups with PostgreSQL client tools: `node scripts/database-backup.cjs backup`, then `node scripts/database-backup.cjs verify <dump-file>`. Restore drills require `DATABASE_URL` to point to a disposable `_test` database and the exact database name as the final confirmation argument: `node scripts/database-backup.cjs restore-test <dump-file> <database_name_test>`.

## Integration and release limits

M-Pesa and bank payments are **manual receipt records**, not provider-confirmed transactions. Daraja/bank connections and SMS/email delivery require provider credentials and are not implemented. Patient accounts must be provisioned by a clinic administrator; public signup is disabled. Automatic bank reconciliation, clinician scheduling/capacity allocation and external clinical terminology integration are not implemented. Care entries do not implement prescribing decision support or diagnostic interpretation. Database backups, production monitoring, privacy/compliance review and clinical acceptance testing must be configured for an actual deployment. This implementation has not been approved for live medical use.

Patient records: admins and receptionists can use **View record ? Edit patient** to update patient details. Only the boss and administrators see **Delete patient** or can call the delete API. Deletion requires confirming the patient number. Patients with visits, appointments, or a portal login are archived from the active directory, preserving their history and disabling portal access; unlinked patients are permanently deleted. Archived patients cannot be edited or open new visits/appointments. All changes are audit logged.
