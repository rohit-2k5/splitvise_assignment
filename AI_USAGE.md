# AI Usage & Collaboration

This document outlines how the AI developer assistant (Antigravity) was utilized to implement and test the Splitwise clone features.

## 1. Task Definition & Plan Generation
* The AI generated and updated structured plans (`BUILD_PLAN.md` and `AI_CONTEXT.md`) based on user specifications.
* The system boundaries, anomaly rules, and database schema mappings were established cooperatively prior to code changes.

## 2. Code Generation & Iterative Refactoring
* **Backend:** The AI generated the custom CSV parser (`csvParser.js`), validation engine (`anomalyDetector.js`), and import service (`importService.js`).
* **Frontend:** The AI updated the main Dashboard view (`Dashboard.jsx`) to embed the CSV file input dropzone, processing status banners, and reactive anomaly validation reports.
* **Refactoring:** The AI identified duplicate logic in split calculation and updated `expenseController.js` to export a unified helper `calculateSplits`, reducing code duplication.

## 3. Database Migration & Local Environment Configuration
* The AI generated schema modifications for the PostgreSQL database via Prisma client models.
* Assisted in troubleshooting connection pool issues by migrating database credentials to a local PostgreSQL container, stabilizing development.

## 4. End-to-End Testing & Verification
* The AI designed and executed a local NodeJS integration script (`backend/src/testImport.js`) to automatically verify user/group seeding, transaction logic, rounding correction, and each of the 8 anomaly edge-cases.
* Created a sample spreadsheet file (`expenses_export.csv`) to test file uploads inside the browser environment.

## 5. Key Prompts Used
- *"Perform a complete requirement audit of the Splitwise clone codebase against the assignment requirements."*
- *"Preserve negative signs during CSV parsing and detect negative amounts as hard anomalies."*
- *"Implement an approval workflow for CSV import anomalies, and add the DB schema to track historical memberships and approvals."*
- *"Update the dynamic balance calculation to support date-aware membership active boundaries and implement the debt simplification (Who Pays Whom) algorithm."*

## 6. AI Mistakes & Fixes
Here are three specific coding mistakes introduced during AI development and how they were resolved:

1. **Prisma Client Database Upsert Parameter Mismatch**
   - *Mistake:* The AI attempted to register users in the scratch test suite using the `password` field, which was not defined in the Prisma database schema.
   - *Resolution:* Cross-referenced `schema.prisma` to verify that `passwordHash` was the required field name and corrected the test parameters.

2. **Negative Signs Sanitized in CSV Import**
   - *Mistake:* In the initial anomaly detector code, the AI sanitized amounts using `row.amount.replace(/[^0-9.]/g, '')`, which stripped out negative signs (`-`) and converted negative amounts to positive numbers.
   - *Resolution:* Updated the regex pattern to preserve the negative sign (`/[^0-9.-]/g`) so that negative numbers are preserved and flagged as invalid amount anomalies.

3. **Unequal Split Currency Validation Failure**
   - *Mistake:* When calculating unequal splits for multi-currency transactions, the AI initially attempted to validate splits in the base currency (INR) against the original amount (USD), resulting in a mathematical mismatch validation failure.
   - *Resolution:* Refactored the split calculations to validate sums in the original input currency first, then convert each itemized split amount to INR dynamically.
