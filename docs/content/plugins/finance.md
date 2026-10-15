---
title: Finance
description: Accounts and credit cards, transactions, monthly budgets, investments, assets and liabilities, and your net worth, with charts, kept in databases you own.
---
Finance is personal finance inside your workspace: what you spend and earn, your bank accounts and credit cards, monthly budgets, investments, everything else you own or owe, and your net worth over time. Charts keep up as you go.

> [!blue] 💰
> Finance is a plugin, so people who don't need it don't carry it. Your money data isn't locked inside it: it's a **Finance** page of ordinary databases, which you can open, edit and search like any page (on your phone too), sync with git, and keep if you ever remove the plugin.

## Set it up

1. Open **Settings → Plugins → Browse** and install **Finance**.
2. Click **Finance** in the sidebar, pick your currency, and click **Set up Finance**. This creates the **Finance** page with its databases and a set of starter categories.
3. Add your accounts with what they hold today, then your transactions as they happen, or import a statement.

## The screens

- **Overview**: your net worth and how it changed since last month; this month's income, spending, savings rate and budget left; a year of cash flow (click a month to see its budget); where your money went; your net worth over time; account balances and card bills; recent transactions.
- **Transactions**: everything, by day, filtered by month, account, category and type, or searched by description, notes and tags. **Add** one, or **Import** a statement.
- **Budget**: a monthly amount for each category, what's spent and left, how much you can spend a day for the rest of the month, and how your spending splits into needs, wants and savings. Click an amount to change it.
- **Accounts**: bank accounts, cash and wallets with their balances; credit cards with their bill, how much of the limit is used, and **Pay bill**; loans with what's left to repay and **Pay EMI**.
- **Investments**: what you've invested, what it's worth now, your return, and how it's spread across stocks, funds, deposits, retirement, gold, crypto and more. Values are yours to enter: click one to update it when you check. A clock marks values not updated in six weeks.
- **Net worth**: what you own less what you owe, its history month by month, and other assets and liabilities: a home, a car, gold, money lent or borrowed.

**Add a transaction** from any screen, or from ⌘K (**Finance: Add a transaction**). Type a description you've used before and its category and account fill in. **Save & add another** is quick for a few at once.

## How money moves

- **Expenses** and **income** change one account's balance.
- A **transfer** moves money between two of your accounts. Paying a credit card bill, a loan EMI, or moving money to savings or a broker are transfers: they aren't spending, and they bring what you owe down.
- **Invest** puts money from an account into investments, and **Redeem** brings it back (a sale, a maturity). One Invest can be **split across several investments**: move ₹3,600 to Zerodha (a transfer), then Invest from Zerodha ₹2,000 into one stock and ₹1,600 into another, or start a new investment right there. What you don't allocate stays in the account. Investing isn't spending: your net worth only moves as your investments' value does.
- An investment's **invested** amount is what you entered on it plus what you've invested since, less what you redeemed. Its **value** is the last value you entered, plus money put in or taken out after that day.
- **Credit cards and loans** hold what you owe. Spending on a card adds to its bill; paying it from your bank clears it.
- Transactions dated in the future are **scheduled**: listed, but not counted in balances until their day.
- Your **net worth** is saved once a month, so the trend fills in as months pass. Bank and cash balances, investments and other assets count as what you own; card bills, loans and other liabilities as what you owe.

## Import a statement

On **Transactions**, click **Import** and choose a CSV export from your bank or card. Finance finds the columns (date, description, and either one amount or separate money in and out columns), shows what it will add, and skips lines that are already there. Categories come from your history: if "BigBasket" was Groceries before, it is again. Imported transactions are tagged `imported`.

## Where your data lives

The **Finance** page holds six databases: **Accounts**, **Transactions**, **Categories** (with monthly budgets), **Investments**, **Assets and liabilities** and **Net worth** (the monthly history). Each transaction is a page, so syncing between computers and your phone never conflicts, and AI agents connected over MCP can read and add to them ("log ₹450 for lunch on my Amex").

You can rename and move the Finance page and add your own columns and views; Finance finds its databases again. Finance runs on your phone too: install it from **Settings → Plugins** in the mobile app. Without it, you can still open the databases there to add transactions on the go.

## Settings

**Settings → Finance**: your **currency** (amounts are shown in it and the databases' money columns follow; amounts aren't converted), and where your data lives.
