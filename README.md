# Splitwise Clone (Shared Expenses App)

A full-stack Splitwise Clone application built to manage shared group expenses, dynamically calculate individual and group balances, perform debt simplification (Who Pays Whom), and support robust CSV imports with an approval workflow for soft anomalies.

## Features
- **User Authentication:** JWT-protected routes for both backend APIs and frontend page views.
- **Dynamic Balance System:** Computes active and inactive member ledger balances in real time based on historical timeline bounds (`joinedAt` & `leftAt`).
- **Debt Simplification:** Simplifies complex settlement loops into the minimum number of transactions (optimized Who Pays Whom).
- **Detailed Share Breakdown:** Expand group member cards to see itemized expense splits and shares.
- **CSV Expense Importer:** Import bulk records with character-loop quote preservation, negative cost rejection, and USD-to-INR conversions.
- **Anomaly Approval Dashboard:** Approve or reject soft duplicates or missing descriptions before importing.

## Tech Stack
- **Backend:** Node.js, Express, Prisma ORM, PostgreSQL.
- **Frontend:** React, Vite, TailwindCSS (Vanilla structure), Lucide Icons.

## Local Development Setup

### 1. Database Setup
Ensure PostgreSQL is running locally or spin up a Postgres Docker container:
```bash
docker run --name splitwise-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=splitwise -p 5432:5432 -d postgres
```

### 2. Backend Configuration
Navigate to the `/backend` folder:
```bash
cd backend
npm install
```
Create a `.env` file based on `.env.example`:
```env
PORT=5000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/splitwise?schema=public"
JWT_SECRET="dev_secret_key_change_me_in_production"
```
Run migrations and generate client:
```bash
npx prisma migrate dev --name init
```
Start the backend server:
```bash
npm run dev
```

### 3. Frontend Configuration
Navigate to the `/frontend` folder:
```bash
cd ../frontend
npm install
```
Create a `.env` file based on `.env.example`:
```env
VITE_API_URL=http://localhost:5000/api
```
Start the client application:
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.
