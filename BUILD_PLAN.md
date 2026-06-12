# Splitwise Clone Build Plan

This build plan outlines the architectural decisions and step-by-step implementation phases for building the Splitwise clone MVP.

---

## 1. Architectural Decisions

### Project Directory Layout
We will use a mono-repository structure with two distinct subdirectories:
* `backend/` - Node.js, Express, Socket.IO, Prisma, PostgreSQL
* `frontend/` - React, Vite, Tailwind CSS, Socket.IO Client

This keeps the codebase clean, separates concerns, and aligns with the individual deployment targets (Render for backend, Vercel for frontend).

### Database Schema Details
Using Prisma, we will define relationships:
* **One-to-Many:** `Group` -> `Expense`, `User` -> `Group` (Creator), `User` -> `Expense` (Payer).
* **Many-to-Many:** `User` <-> `Group` via the join table `GroupMember`.
* **Expense Splits:** Each `Expense` has multiple `ExpenseSplit` records connecting it to `User`. The split amount is computed on the backend and saved as a `Decimal` to ensure precision. The original split inputs (percentage, shares, unequal amount) are also saved for UI rendering.

### Real-Time Chat Architecture
* When a user opens `/expense/:id`, the React client connects to the Socket.IO namespace and joins room `expense_<id>`.
* Messages can be sent over WebSocket. The server:
  1. Validates the JWT.
  2. Saves the message to the `Message` table in PostgreSQL.
  3. Broadcasts the saved message to the Socket.IO room.
* When the client mounts the page, they fetch the history of messages using `GET /api/messages/expense/:expenseId`.

### State Management
* **Authentication:** Managed via a global React Context (`AuthContext`) which tracks the current logged-in user and token. On refresh, the token is read from `localStorage`.
* **Group & Expense Data:** Loaded dynamically per page view using standard React hooks (`useState`, `useEffect`). Since this is a minimalist dashboard, keeping state local to the components reduces state-sync complexity.

---

## 2. Implementation Roadmap

### Phase 1: Project Initialization & DB Setup
- [ ] Initialize git repository and create `backend` and `frontend` folders.
- [ ] **Backend setup:**
  - Create `package.json`, install Express, Prisma, JWT, bcryptjs, cors, socket.io.
  - Initialize Prisma with `npx prisma init`.
  - Configure the Prisma Schema using the Neon PostgreSQL connection string.
  - Run database migrations to create the tables.

### Phase 2: Backend API Development (Rest & WebSockets)
- [ ] **Auth Router:**
  - User registration (hashing passwords with bcrypt).
  - User login (signing JWT).
- [ ] **Groups Router:**
  - Create groups.
  - Fetch user's groups.
  - Add registered users to a group.
  - Remove members (creator only).
- [ ] **Expenses & Balance Calculations:**
  - Create expenses (support equal, unequal, percentage, share splits).
  - Write calculation logic on backend to compute split amounts and save.
  - Calculate group-wise net balances dynamically.
- [ ] **Settlements:**
  - Record manual payments between users.
- [ ] **Socket.IO Chat Server:**
  - Establish Socket.IO server alongside Express.
  - Implement authentication middleware for Socket.IO.
  - Implement room joins/leaves and message broadcasting.

### Phase 3: Frontend Development
- [ ] **Setup React + Vite + Tailwind:**
  - Configure Router (`/login`, `/register`, `/dashboard`, `/group/:id`, `/expense/:id`).
  - Style clean minimalist layout.
- [ ] **Auth Pages:**
  - Login & Register views.
  - Hook up `AuthContext`.
- [ ] **Dashboard View:**
  - List of groups.
  - Overall summary (how much you owe / are owed in total).
  - Form to create a new group.
- [ ] **Group Detail View:**
  - Member management (add/remove).
  - Expense list + create expense form (with equal, unequal, percentage, share split options).
  - Group balance list showing who owes whom.
  - Record settlement form.
- [ ] **Expense Detail & Chat View:**
  - Display expense details and split details.
  - Embed Chat component connecting via Socket.IO client.
  - Render message history and live messages.

### Phase 4: Integration, Testing & Bug Fixing
- [ ] Perform integration testing on balance calculation logic.
- [ ] Test real-time message delivery under concurrent clients.
- [ ] Fix formatting of decimals and edge cases in division/rounding of splits.

### Phase 5: Deployment
- [ ] Deploy PostgreSQL on Neon.
- [ ] Deploy backend on Render (verify WebSocket support works).
- [ ] Deploy frontend on Vercel (verify routing fallbacks).
