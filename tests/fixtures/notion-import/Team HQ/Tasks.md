---
type: database
---
```database
{
  "properties": [
    {
      "name": "Status",
      "options": [
        {
          "color": "gray",
          "name": "Done"
        },
        {
          "color": "brown",
          "name": "Todo"
        }
      ],
      "type": "status"
    },
    {
      "name": "Due Date",
      "type": "date"
    },
    {
      "name": "Done?",
      "type": "checkbox"
    },
    {
      "name": "Project",
      "options": [
        {
          "color": "gray",
          "name": "Launch"
        }
      ],
      "type": "select"
    }
  ],
  "views": [
    {
      "id": "table",
      "name": "Table",
      "type": "table"
    },
    {
      "groupBy": "Status",
      "id": "board",
      "name": "Board",
      "type": "board"
    },
    {
      "dateProperty": "Due Date",
      "id": "calendar",
      "name": "Calendar",
      "type": "calendar"
    }
  ]
}
```
