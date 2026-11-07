---
icon: ✅
type: database
order: 3
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
    { "name": "Due", "type": "date" }
  ],
  "views": [
    { "id": "table", "name": "All tasks", "type": "table" },
    { "id": "board", "name": "Board", "type": "board", "groupBy": "Status" },
    { "id": "calendar", "name": "Calendar", "type": "calendar", "dateProperty": "Due" }
  ]
}
```
