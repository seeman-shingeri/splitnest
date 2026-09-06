# Home Harmony Hub

Build a complete production-ready responsive web application called "Roommate Expense & Meal Manager" for managing shared room expenses, roommate joining, settlements, and meal tracking.

The app must be fully functional, mobile-friendly, secure, and connected to Supabase.

====================================================

1. AUTHENTICATION SYSTEM

====================================================

Implement secure authentication using Supabase Auth:

- Email/password signup

- Login

- Logout

- Session persistence

- Protected routes

Each authenticated owner should only access their own group data.

====================================================

2. ROOMMATE MANAGEMENT

====================================================

Create roommate management module:

Allow owner to:

- Add roommate

- Edit roommate

- Delete roommate

Each roommate should have:

- id

- full name

- room number

- phone number (optional)

- join date

Validation:

- full name required

- room number required

Display roommate list in a table/card format.

====================================================

3. REFERRAL JOIN SYSTEM

====================================================

Allow new users to join an owner's roommate group using a one-time referral code.

Owner features:

- Generate referral code

- View active referral code

- Referral code becomes invalid after one use

- New referral code is auto-generated after successful use

Joining user features:

- Enter referral code

- Join owner's group if valid

Validation:

- invalid referral code should show error

- used referral code cannot be reused

Create:

- Referral Management Page

- Join with Referral Code Page

====================================================

4. EXPENSE MANAGEMENT

====================================================

Allow owner to:

- Add expense

- Edit expense

- Delete expense

Each expense should include:

- expense title

- amount

- category

- date

- paid by roommate

- split type

- notes

Categories:

- Rent

- Electricity

- Water

- Internet

- Groceries

- Maintenance

- Other

Split types:

1. Equal split

2. Manual split

Equal split:

- divide expense equally among selected roommates

Manual split:

- custom amount per roommate

Validation:

- expense amount > 0

- manual split total must equal expense total

====================================================

5. BALANCE CALCULATION

====================================================

For every roommate calculate:

- total paid

- total owed

- net balance

Formula:

net balance = total paid - total owed

If net balance > 0:

- roommate should receive money

If net balance < 0:

- roommate owes money

Recalculate balances automatically whenever:

- expense added

- expense updated

- expense deleted

====================================================

6. SETTLEMENT LOGIC

====================================================

Generate settlement suggestions automatically.

The app must:

1. Find roommates who owe money

2. Find roommates who should receive money

3. Match debtors with creditors

4. Minimize number of transactions

Example:

If:

A owes 300

B owes 200

C should receive 500

Then:

A pays C 300

B pays C 200

Display settlement statements like:

"John owes Ravi ₹500"

Create Settlements Page.

====================================================

7. DASHBOARD & REPORTS

====================================================

Create dashboard showing:

- total roommates

- total expenses this month

- pending settlements

- total meal revenue

- total categories used

Add charts:

- monthly expense chart

- category-wise expense pie chart

- meal revenue chart

Reports page should show:

- monthly spending

- spending per roommate

- category-wise spending

- outstanding balances

- meal payable per roommate

Add filters:

- by month

- by roommate

- by category

====================================================

8. MEAL POINTS SYSTEM

====================================================

Create meal tracking system where:

- Owner sets price per meal

- Each roommate gets daily meal points

- 1 meal = 1 point

- 2 meals = 2 points

Example:

If roommate eats twice:

meal_points = 2

Store daily meal entries.

At month end calculate:

total payable = total meal points × price per meal

Example:

price per meal = ₹50

points = 20

payable = ₹1000

Display:

- total meal points per roommate

- monthly meal payable amount

- total meal revenue

Create:

- Meal Settings Page

- Meal Entry Page

- Meal Dashboard Page

Validation:

- meal points cannot be negative

- only owner can set price per meal

====================================================

9. DATABASE TABLES

====================================================

Use Supabase with these tables:

1. users

2. roommates

3. expenses

4. expense_splits

5. settlements

6. referral_codes

7. group_members

8. meal_settings

9. meal_entries

Create relational links using foreign keys.

Requirements:

- proper indexing

- cascade deletes

- row-level security

- data isolation per owner

====================================================

10. UI REQUIREMENTS

====================================================

Create these pages:

1. Login / Signup

2. Dashboard

3. Roommates

4. Expenses

5. Settlements

6. Reports

7. Referral Management

8. Join with Referral Code

9. Meal Settings

10. Meal Entry

11. Meal Dashboard

UI must be:

- modern

- clean

- responsive

- sidebar navigation

- mobile-friendly

- loading indicators

- success/error alerts

- form validations

- dashboard cards

- charts

- tables

- modals for add/edit forms

====================================================

11. VALIDATIONS & ERROR HANDLING

====================================================

Implement validations:

1. No negative expense amount

2. No negative meal points

3. Manual split must equal expense amount

4. Referral code only valid once

5. Secure protected routes

6. Prevent invalid settlement calculations

7. Handle empty states gracefully

8. Display clear error messages

====================================================

12. BUSINESS LOGIC REQUIREMENTS

====================================================

Ensure:

1. Balance totals remain accurate

2. Settlement calculations minimize transactions

3. Referral codes regenerate after successful use

4. Meal payable updates automatically after meal entry

5. Dashboard updates in real time

6. Reports calculate correctly for all filters

====================================================

13. FINAL EXPECTATIONS

====================================================

Generate:

- complete responsive UI

- Supabase integration

- CRUD operations for all modules

- accurate balance calculations

- automatic settlements

- referral code logic

- meal point calculations

- reports and analytics

- secure authentication

- validations

- real-time updates

- sample seed data for testing

Do not leave placeholders.

Do not skip any page.

Ensure all pages, forms, calculations, reports, and modules are fully functional end-to-end.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://splitnest.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5a6b07b9-5264-4687-82a8-11198e33e4c0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
