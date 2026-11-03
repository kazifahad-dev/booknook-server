# BookNook Server

Express and MongoDB API for the BookNook online library.

**Live API:** https://booknook-server-delta.vercel.app

**Client repository:** https://github.com/kazifahad-dev/booknook-client

## Routes

Public:

- `GET /books` : all books (`?limit=6` for the newest, `?email=` for one user's books)
- `GET /books/:id` : one book

Protected (needs a valid JWT in the `Authorization: Bearer` header):

- `POST /books` : add a book
- `PATCH /books/:id` : update a book (owner only)
- `DELETE /books/:id` : delete a book (owner only)
- `POST /borrows` : borrow a book
- `GET /borrows` : borrows of the logged in user
- `DELETE /borrows/:id` : return a book

## How It Works

- Borrowing a book lowers its available copies by one with `$inc`, and returning it raises them again
- A user cannot borrow the same book twice at the same time, and a book with no copies left cannot be borrowed
- The JWT is checked against the public keys published by the client app, so the server never holds a secret

## Environment Variables

```
MONGODB_URI=your_mongodb_connection_string
CLIENT_URL=https://booknook-client-opal.vercel.app
```