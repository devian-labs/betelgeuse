---
type: database
icon: lucide:ListChecks:orange
---
```database
{
  "properties": [
    {
      "name": "Status",
      "options": [
        {
          "color": "green",
          "name": "Done"
        },
        {
          "color": "default",
          "name": "To Do"
        }
      ],
      "type": "status"
    },
    {
      "name": "Priority",
      "options": [
        {
          "color": "red",
          "name": "High"
        },
        {
          "color": "blue",
          "name": "Low"
        }
      ],
      "type": "select"
    },
    {
      "name": "Tags",
      "options": [
        {
          "color": "green",
          "name": "Docs"
        },
        {
          "color": "default",
          "name": "Web"
        }
      ],
      "type": "multi_select"
    },
    {
      "name": "Due",
      "type": "date"
    },
    {
      "name": "Done",
      "type": "checkbox"
    },
    {
      "format": "rupee",
      "name": "Budget",
      "type": "number"
    },
    {
      "name": "Project",
      "type": "text"
    },
    {
      "name": "Owner",
      "options": [
        {
          "color": "gray",
          "name": "Ada"
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
      "dateProperty": "Due",
      "id": "calendar",
      "name": "Calendar",
      "type": "calendar"
    }
  ]
}
```
