---
icon: 🗺️
type: database
---
```database
{
  "properties": [
    { "name": "Status", "type": "status", "options": [
      { "name": "Not started", "color": "gray" },
      { "name": "In progress", "color": "blue" },
      { "name": "Done", "color": "green" }
    ] },
    { "name": "Priority", "type": "select", "options": [
      { "name": "High", "color": "red" },
      { "name": "Medium", "color": "yellow" },
      { "name": "Low", "color": "gray" }
    ] },
    { "name": "Estimate", "type": "number" },
    { "name": "Due", "type": "date" },
    { "name": "Tags", "type": "multi_select", "options": [
      { "name": "app", "color": "purple" },
      { "name": "agents", "color": "orange" },
      { "name": "git", "color": "brown" }
    ] }
  ],
  "views": [
    { "id": "table", "name": "All tasks", "type": "table", "calcs": { "Estimate": "sum", "Status": "percent_not_empty" } },
    { "id": "board", "name": "Board", "type": "board", "groupBy": "Status" },
    { "id": "calendar", "name": "Calendar", "type": "calendar", "dateProperty": "Due" }
  ]
}
```
