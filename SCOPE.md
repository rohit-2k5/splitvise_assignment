# CSV Import Anomaly Scope & Policies

This document outlines the validation rules, detected anomalies, and error-handling policies for the Splitwise Clone CSV Import feature.

## 1. CSV Data Format Specifications
The importer expects a CSV file containing the following columns (matched case-insensitively, ignoring non-alphanumeric characters):

| Column | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| **`Date`** | YYYY-MM-DD | Yes | The calendar date of the expense. Cannot be in the future. |
| **`Description`** | String | No | Description of the expense. |
| **`Group`** | String | Yes | Name or UUID of the group. Must exist. |
| **`Amount`** | Decimal | Yes | Total cost of the expense. Must be positive (> 0). |
| **`Paid By`** | String (Email) | Yes | Email of the payer. Must exist in group. |
| **`Split Type`** | String | Yes | One of: `EQUAL`, `UNEQUAL`, `PERCENTAGE`, `SHARE`. |
| **`Splits`** | String | Yes | Split details (e.g., `alice@example.com:50;bob@example.com:50`). |

---

## 2. Supported Anomalies and Actions
The system checks every imported row and logs anomalies in the `import_anomalies` table. Below are the specific anomaly codes, descriptions, and recovery actions:

### 1. `INVALID_DATE`
* **Condition:** Date column is empty, malformed, or represents a future calendar date.
* **Action:** **Skip Row** (to prevent database integrity/logic issues).

### 2. `MISSING_DESCRIPTION`
* **Condition:** Description is blank or empty.
* **Action:** **Auto-Correct** (Assigned default description `Imported Expense - Row [N]`) and proceed with import.

### 3. `INVALID_AMOUNT`
* **Condition:** Amount column is not a number, empty, or <= 0.
* **Action:** **Skip Row** (financial transactions must have positive value).

### 4. `GROUP_NOT_FOUND`
* **Condition:** Group name or UUID specified does not match any existing group.
* **Action:** **Skip Row** (expenses must belong to a valid active group).

### 5. `PAYER_NOT_FOUND`
* **Condition:** Payer email is not registered on the platform, or is registered but is not a member of the target group.
* **Action:** **Skip Row** (only group members can pay for expenses).

### 6. `INVALID_SPLITS`
* **Condition:** Splits data is empty, or split values are mathematically incorrect:
  * For `UNEQUAL` split type: Sum of split amounts != total expense amount.
  * For `PERCENTAGE` split type: Sum of split percentages != 100%.
  * For `SHARE` split type: Sum of split shares <= 0.
* **Action:** **Skip Row** (prevents debt calculation imbalances).

### 7. `PARTICIPANT_NOT_FOUND`
* **Condition:** One or more split participants are not registered users, or are not members of the target group.
* **Action:** **Skip Row** (prevents splitting expenses with external or non-member users).

### 8. `DUPLICATE_EXPENSE`
* **Condition:** An expense with the same description, amount, group, payer, and date already exists in the database.
* **Action:** **Skip Row** (prevents duplicate charging).
