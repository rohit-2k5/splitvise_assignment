# Splitwise Clone AI Context (Source of Truth)

This document is the absolute source of truth for the Splitwise clone internship MVP. All development, schemas, APIs, and design decisions must align with the specifications described below.

---

## 1. Product Goals & Scope

### Goal
Build a working, deployed Splitwise-inspired expense sharing MVP that demonstrates solid engineering principles, clean code structure, and accurate balance calculations.

### User Personas
* **Roommates sharing bills:** Splitting monthly rent, utilities, and grocery bills.
* **Friends traveling together:** Tracking shared travel costs, meals, and activities.
* **Small groups managing expenses:** Splitting costs for events or shared projects.

### MVP Features
* **Authentication:** Login/signup using simple email/password.
* **Group Management:** Create groups, add registered users, remove members (group creator only).
* **Expense Management:** Create and split expenses.
* **Split Types:** Equal, unequal, percentage, and share-based splits.
* **Real-time Expense Chat:** Text updates inside specific expenses, persisted in the database.
* **Balance Tracking:** Group-wise balances and individual balance summaries.
* **Debt Settlement:** Record payments to settle balances instantly.

### Out of Scope
* Recurring expenses
* Multi-currency support (Default currency is INR)
* OCR receipt scanning
* Real payment gateway integration (settlements are recorded manually)
* Advanced analytics & charts

---

## 2. Technical Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React (Vite) + Tailwind CSS + React Router SPA |
| **State Management** | React Context (primarily for Auth) |
| **Backend** | Node.js + Express |
| **Real-time Communication** | Socket.IO (persisted chats) |
| **Database** | Neon PostgreSQL |
| **ORM** | Prisma ORM |
| **Authentication** | JWT (JSON Web Tokens) stored securely |

---

## 3. Database Schema Design (Prisma Model Idea)

The application uses a relational PostgreSQL database. Below is the proposed table design to implement in Prisma:

### Tables & Key Relationships
1. **User (`users`)**
   * Fields: `id`, `email`, `password_hash`, `name`, `created_at`
2. **Group (`groups`)**
   * Fields: `id`, `name`, `creator_id` (FK to `users`), `created_at`
3. **GroupMember (`group_members`)**
   * Fields: `id`, `group_id` (FK to `groups`), `user_id` (FK to `users`), `joined_at`
   * Unique constraint on `(group_id, user_id)`
4. **Expense (`expenses`)**
   * Fields: `id`, `group_id` (FK to `groups`), `paid_by_id` (FK to `users`), `amount` (Decimal), `description`, `created_at`
5. **ExpenseSplit (`expense_splits`)**
   * Fields: `id`, `expense_id` (FK to `expenses`), `user_id` (FK to `users`), `amount` (Decimal), `split_value` (Decimal - can represent percentage, shares, or exact amount depending on type), `split_type` (Enum: `EQUAL`, `UNEQUAL`, `PERCENTAGE`, `SHARE`)
6. **Settlement (`settlements`)**
   * Fields: `id`, `group_id` (FK to `groups`), `sender_id` (FK to `users`), `receiver_id` (FK to `users`), `amount` (Decimal), `created_at`
7. **Message (`messages`)**
   * Fields: `id`, `expense_id` (FK to `expenses`), `sender_id` (FK to `users`), `message_text`, `created_at`
8. **Import (`imports`)**
   * Fields: `id`, `filename`, `status`, `created_at`
9. **ImportAnomaly (`import_anomalies`)**
   * Fields: `id`, `import_id` (FK to `imports`), `row_number`, `anomaly_type`, `description`, `action_taken`

---

## 4. API Endpoints

All backend APIs should be grouped by resource and prefixed with `/api`.

### Auth Router (`/api/auth`)
* `POST /register` - Register a new user
* `POST /login` - Login and get JWT

### Groups Router (`/api/groups`)
* `POST /` - Create a group
* `GET /` - List user's groups
* `GET /:id` - Get group details (members, expenses, balances)
* `POST /:id/members` - Add registered member to group
* `DELETE /:id/members/:userId` - Remove member (creator only)

### Expenses Router (`/api/expenses`)
* `POST /` - Create an expense (and its splits)
* `GET /:id` - Get details of a single expense (and splits)
* `DELETE /:id` - Delete an expense

### Settlements Router (`/api/settlements`)
* `POST /` - Record a debt settlement payment between two users
* `GET /group/:groupId` - Get list of settlements in a group

### Messages Router (`/api/messages`)
* `GET /expense/:expenseId` - Fetch chat history for an expense

### Import Router (`/api/import`)
* `POST /csv` - Upload a CSV file and process imports with anomaly detection
* `GET /report/:id` - Fetch the import run stats and anomaly logs

---

## 5. System Architecture & Workflows

### Authentication
* Client sends credentials to `/api/auth/login`.
* Server signs JWT with User ID and returns it.
* Client stores JWT in `localStorage` or memory, sends it in `Authorization: Bearer <token>` header for subsequent requests.

### Balance Calculation (No simplification algorithm)
* For a given group, a user's net balance is calculated as:
  `Net Balance = (Total Paid by User in Group Expenses) - (Total Owed by User in Group Expenses) + (Total Settled Payments Received by User) - (Total Settled Payments Made by User)`
* Positive balance means other users owe them. Negative balance means they owe others.

### Expense Chat (Real-time)
* WebSockets (Socket.IO) used to connect client to server.
* On opening `/expense/:id`, client joins a socket room for that `expenseId`.
* Sending a message:
  1. Client sends message via WebSocket or HTTP POST.
  2. Server saves the message in PostgreSQL.
  3. Server broadcasts message to all clients in the `expenseId` room.

---

## 6. Deployment & Environments

* **Frontend:** Vercel (SPA fallback configured for React Router)
* **Backend:** Render (needs a web service rather than static site to run Socket.IO WebSocket server)
* **Database:** Neon PostgreSQL (serverless connection pooling handled by Prisma)

---

## 7. Testing & Quality Assurance
* Integration tests for core endpoints (`auth`, `expenses`, `balances`).
* Unit tests for balance and split calculations (equal, unequal, percentage, share).
* Manual user workflow testing.

---

## 8. Current Folder Structure (Backend)

```
backend/
├── prisma/
│   ├── migrations/
│   └── schema.prisma
├── src/
│   ├── config/
│   │   └── prisma.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── groupController.js
│   │   ├── expenseController.js
│   │   ├── settlementController.js
│   │   ├── messageController.js
│   │   └── importController.js
│   ├── imports/
│   │   ├── csvParser.js
│   │   ├── anomalyDetector.js
│   │   └── importService.js
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   └── errorMiddleware.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── groupRoutes.js
│   │   ├── expenseRoutes.js
│   │   ├── settlementRoutes.js
│   │   ├── messageRoutes.js
│   │   └── importRoutes.js
│   └── server.js
├── .env
├── package.json
└── package-lock.json
```

---

## 9. API Implementation Details (Auth Module)

* **Password Hashing:** Done via `bcryptjs` using 10 rounds of salt generation.
* **Token Signing:** JWT tokens sign user `id`, using key `JWT_SECRET`, expiring in `30d`.
* **Validation Rules:**
  * Emails are converted to lowercase and trimmed.
  * Email format validated via `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
  * Passwords must be at least 6 characters in length.
* **API Return Format (Success):**
  * `POST /api/auth/register` and `POST /api/auth/login`:
    ```json
    {
      "success": true,
      "data": {
        "id": "user-uuid",
        "name": "User Name",
        "email": "user@email.com",
        "token": "signed-jwt-token"
      }
    }
    ```
  * `GET /api/auth/me`:
    ```json
    {
      "success": true,
      "data": {
        "id": "user-uuid",
        "email": "user@email.com",
        "name": "User Name",
        "createdAt": "iso-timestamp"
      }
    }
    ```
* **API Error Format:**
  ```json
  {
    "success": false,
    "message": "Error details/reason"
  }
  ```

---

## 10. API Implementation Details (Group Module)

* **Group Creation Transaction:** Handled via Prisma `$transaction` to guarantee that whenever a group is created, its creator is atomically added as the first `GroupMember`.
* **Member Addition Rule:** Only the group creator can add new users to the group. The user must be a registered member of the platform (lookup by email).
* **Member Removal Rule:** Only the group creator can remove a member. The group creator cannot remove themselves.
* **Dynamic Balance Calculations:** Net balances are calculated in real-time when requesting group details via `GET /api/groups/:id`:
  * `Net Balance = Total Paid - Total Owed + Settled Payments Sent - Settled Payments Received`
  * Positive values mean the user is owed money; negative values mean they owe money.
* **API Endpoints:**
  * `POST /api/groups`
    * Request Body: `{ "name": "Group Name" }`
  * `GET /api/groups`
    * Returns listing of groups user belongs to.
  * `GET /api/groups/:id`
    * Returns detailed information, list of members, expenses list, settlements, and dynamic member balances.
  * `POST /api/groups/:id/members`
    * Request Body: `{ "email": "invitee@example.com" }`
  * `DELETE /api/groups/:id/members/:userId`
    * Removes member from the group.

---

## 11. API Implementation Details (Expense Module)

* **Split Rounding Adjustments:** Standard splits are rounded to 2 decimal places. To ensure the sum of splits is mathematically equal to the total expense amount, any rounding remainder (in 0.01 increments) is applied to the last user in the splits list.
* **Split Calculations:**
  * **EQUAL:** Divided equally among list of selected user IDs. Remainder distributed to the first few users.
  * **UNEQUAL:** Users owe exact input amounts. Validates that the sum of input amounts matches total expense amount.
  * **PERCENTAGE:** Users owe input percentage. Validates that the sum of percentages is exactly 100%. Calculates: `amount = (percentage / 100) * total_amount`.
  * **SHARE:** Users owe input shares factor. Sums all shares. Calculates: `amount = (shares / total_shares) * total_amount`.
* **API Endpoints:**
  * `POST /api/expenses`
    * Request Body:
      ```json
      {
        "groupId": "group-uuid",
        "amount": 100.00,
        "description": "Expense description",
        "paidById": "payer-user-uuid",
        "splitType": "EQUAL | UNEQUAL | PERCENTAGE | SHARE",
        "splits": [
          // If EQUAL: ["user-uuid-1", "user-uuid-2"]
          // If other types: [{ "userId": "user-uuid-1", "splitValue": 10.00 }]
        ]
      }
      ```
  * `GET /api/expenses/:id`
    * Returns single expense details, payer information, splits list, and base group metadata.
  * `DELETE /api/expenses/:id`
    * Authorizes group members to delete the expense. (Prisma cascade delete automatically deletes all corresponding split records).

---

## 12. API Implementation Details (Settlement Module)

* **Settlement Behavior:** Settled payments are recorded manually by users. Once saved to the database, they dynamically adjust the Net Balance calculation for the sender and receiver.
* **API Endpoints:**
  * `POST /api/settlements`
    * Request Body:
      ```json
      {
        "groupId": "group-uuid",
        "senderId": "sender-user-uuid",
        "receiverId": "receiver-user-uuid",
        "amount": 50.00
      }
      ```
  * `GET /api/settlements/group/:groupId`
    * Returns the list of settlements created inside the group, sorted by creation date.

---

## 13. API Implementation Details (Real-time Chat Module)

* **Real-time Synchronization:** Leverages Socket.IO for bi-directional connection. Users are isolated into channels per expense (`expense_<expenseId>`) to prevent cross-room message leaks.
* **HTTP History REST API:**
  * `GET /api/messages/expense/:expenseId`
    * Returns the array of persisted messages for the expense room, sorted chronologically (`asc`).
* **Socket.IO Event Specifications:**
  * `join_room` (inbound)
    * Payload: `{ "expenseId": "expense-uuid" }`
    * Description: Joins the socket to the room room `expense_<expenseId>`.
  * `send_message` (inbound)
    * Payload: `{ "expenseId": "expense-uuid", "senderId": "user-uuid", "messageText": "Message body" }`
    * Description: Saves message to PostgreSQL and broadcasts `receive_message` payload back to the room.
  * `receive_message` (outbound broadcast)
    * Payload:
      ```json
      {
        "id": "message-uuid",
        "expenseId": "expense-uuid",
        "messageText": "Message body",
        "createdAt": "iso-timestamp",
        "sender": {
          "id": "sender-user-uuid",
          "name": "Sender Name",
          "email": "sender@example.com"
        }
      }
      ```
  * `leave_room` (inbound)
    * Payload: `{ "expenseId": "expense-uuid" }`
    * Description: Unsubscribes socket from the channel room `expense_<expenseId>`.

---

## 14. CSV Import and Anomaly Handling Module

### CSV File Column Specifications
* **`Date`**: YYYY-MM-DD format (must not be empty, invalid, or in the future).
* **`Description`**: Text describing the bill. If missing, auto-assigns "Imported Expense - Row [N]".
* **`Group`**: Group name or ID. Must exist in the database.
* **`Amount`**: Numeric value > 0 representing the total expense cost.
* **`Paid By`**: Email of the user who paid. Must exist in the database and be a member of the group.
* **`Split Type`**: One of `EQUAL`, `UNEQUAL`, `PERCENTAGE`, `SHARE`.
* **`Splits`**: Semicolon-separated list of user splits, formatted as `email:value` (e.g. `alice@example.com:50;bob@example.com:50`). For `EQUAL` splits, list of emails (e.g. `alice@example.com;bob@example.com`).

### Anomaly Policies and Actions
1. **`INVALID_DATE`**: Skip row, log anomaly.
2. **`MISSING_DESCRIPTION`**: Auto-correct to default string, proceed with import.
3. **`INVALID_AMOUNT`**: Skip row, log anomaly.
4. **`GROUP_NOT_FOUND`**: Skip row, log anomaly.
5. **`PAYER_NOT_FOUND`**: Skip row, log anomaly.
6. **`INVALID_SPLITS`**: Skip row, log anomaly.
7. **`PARTICIPANT_NOT_FOUND`**: Skip row, log anomaly.
8. **`DUPLICATE_EXPENSE`**: Skip row, log anomaly.


