---
icon: 🗃️
tags: [guide, databases]
---
A database is a page whose sub-pages are its rows. Each row's values are saved in that row's frontmatter. Here's [[Roadmap]], embedded in this page and fully editable:

![[Roadmap]]

## Creating a database

- `/Database – Inline` creates a database under the current page and shows it in place, like the one above.
- `/Database – Full page` creates a database as a sub-page and links to it.
- On an empty page, **Get started with** offers Table, Board and Calendar.
- [[Import]] turns each Notion database into a Betelgeuse database.

## Views

Each database can have several views. Every view keeps its own sorts, filters, column order and widths, hidden properties and calculations.

| View     | What it shows                                                                                 |
| -------- | --------------------------------------------------------------------------------------------- |
| Table    | Rows and columns, with calculations in the footer                                             |
| Board    | Cards grouped by a Select or Status property. Drag cards between groups to change their value |
| List     | One line per row                                                                              |
| Gallery  | A card for each row                                                                           |
| Calendar | Rows on the day of a date property. Drag a row to another day to change its date              |

- Click `+` after the view tabs to add a view.
- Click the current view's tab to rename it, change its layout, duplicate it or delete it.
- **View settings** sets the layout, **Group by** for boards, **Show calendar by** for calendars, which properties are shown, and whether long text wraps.

## Properties

| Type             | Holds                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Title            | The row's name, which is also its file name                                                                 |
| Text             | Any text                                                                                                    |
| Number           | A number, shown as a plain number, with commas, as a percentage or in dollars, euros, pounds, rupees or yen |
| Select           | One option from a list                                                                                      |
| Multi-select     | Several options from a list                                                                                 |
| Status           | Where a row is up to, such as Not started, In progress or Done                                              |
| Date             | A date                                                                                                      |
| Checkbox         | Yes or no                                                                                                   |
| URL              | A web link                                                                                                  |
| Email            | An email address                                                                                            |
| Relation         | Links to rows of another database (or the same one)                                                         |
| Rollup           | A value worked out from the rows a relation links to                                                        |
| Created time     | When the row was created, filled in for you                                                                 |
| Last edited time | When the row was last changed, filled in for you                                                            |

Click a column header to rename the property, change its type or number format, sort or filter by it, hide it, wrap its text or delete it. Options for select, multi-select and status properties each have a colour: open an option's menu, while picking a value, to rename it, recolour it or delete it. Drag a header to reorder the columns, and drag its edge to resize.

## Relations and rollups

A **Relation** links each row to rows of another database: tasks to the project they belong to, books to their authors. Pick the database under **Related to** in the property's menu, then click a cell to link pages, search for them, or create a new one there. **Limit to one page** keeps it to a single link.

Turn on **Show on …** to see the relation from the other side too: the related database gets a property listing the rows that link to each of its pages. Editing either side changes the same links.

A **Rollup** follows a relation and reads a property of the linked rows. It can show their values as they are, or calculate over them: count the tasks of a project, sum their estimates, or show what percentage are done.

Links are stored as ordinary wikilinks in the row's frontmatter, so they show up as backlinks and follow renames:

```yaml
---
Task: ["[[Ship the MCP server]]"]
---
```

If a property held names before it became a relation (a select of project names, say), choosing its database turns them into links.

## Sort, filter and search

The icons above a database add **Filter** and **Sort** rules, which show as pills you can edit or remove, and **Search** inside the database. Filters fit the property's type: text can contain a word, numbers can be greater or less than a value, dates can be before or after a day, and checkboxes can be checked or unchecked. Any property can be empty or not empty.

## Calculations

Hover the footer of a table and click under a column to add a calculation. [[Roadmap]] sums its estimates and shows what percentage of rows have a status.

<details>
<summary>Every calculation</summary>

- **Any property:** count all, count values, count empty, count not empty, count unique values, percent empty, percent not empty
- **Numbers:** sum, average, median, min, max, range
- **Checkboxes:** checked, unchecked, percent checked
- **Dates:** earliest, latest, date range

</details>

## Rows are pages

Click **New** to add a row. Hover a row's title and click **OPEN** to see it in a side peek, with its properties at the top and a normal page below. Press Esc to close it, or open it as a full page. A row's menu can also rename, duplicate or delete it.

Try it with [[Design the database views]], [[Ship the MCP server]] or [[Sync vault to GitHub]].

## How it's stored

`Roadmap.md` has `type: database` in its frontmatter and a code block marked `database` that holds the properties and views as JSON. Each row is a file in the `Roadmap/` folder, with its values as frontmatter:

```yaml
---
Status: In progress
Priority: High
Estimate: 3
Due: 2026-10-09
Tags: [agents]
---
```

Agents can read a database as records, filtered and sorted, with `query_database`. See [[Connect your AI agents]].

> [!gray] 🚧
> Formulas aren't supported yet. Boards group by Select or Status, and calendars by a date.
