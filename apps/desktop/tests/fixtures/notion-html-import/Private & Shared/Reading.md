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
          "color": "blue",
          "name": "Reading"
        }
      ],
      "type": "status"
    }
  ],
  "title": "Book",
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
    }
  ]
}
```
