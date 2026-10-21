# Library Books REST API

The API uses the `/api` base path and JSON request and response bodies.

## Endpoints

- **List books**
  - Method: `GET`
  - Path: `/api/books`
  - Description: Return the collection of books.
  - Success: `200 OK`

- **Get one book**
  - Method: `GET`
  - Path: `/api/books/{bookId}`
  - Description: Return the book identified by `bookId`.
  - Success: `200 OK`

- **Create a book**
  - Method: `POST`
  - Path: `/api/books`
  - Description: Create a book and return the stored record.
  - Example request body:
    ```json
    {
      "title": "The Left Hand of Darkness",
      "author": "Ursula K. Le Guin",
      "isbn": "9780441478125",
      "publishedYear": 1969
    }
    ```
  - Success: `201 Created`

- **Replace a book**
  - Method: `PUT`
  - Path: `/api/books/{bookId}`
  - Description: Replace all editable fields for the identified book.
  - Example request body:
    ```json
    {
      "title": "The Left Hand of Darkness",
      "author": "Ursula K. Le Guin",
      "isbn": "9780441478125",
      "publishedYear": 1969
    }
    ```
  - Success: `200 OK`

- **Delete a book**
  - Method: `DELETE`
  - Path: `/api/books/{bookId}`
  - Description: Delete the identified book.
  - Success: `204 No Content`

- **List books by author**
  - Method: `GET`
  - Path: `/api/books?author=Ursula%20K.%20Le%20Guin`
  - Description: Return books whose author matches the `author` query parameter.
  - Success: `200 OK`

## Error responses

- **`400 Bad Request`**: The request body is invalid, such as a create request missing the required `title` field.
- **`404 Not Found`**: The requested book ID does not exist, such as `GET /api/books/9999`.
