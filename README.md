# BookNook Server

Express and MongoDB API for the BookNook online library.

**Live API:** https://booknook-server-delta.vercel.app

**Client repository:** https://github.com/kazifahad-dev/booknook-client

## Routes

- `GET /books` : all books (use `?limit=6` for the newest, `?email=` for one user's books)
- `GET /books/:id` : one book
- `POST /books` : add a book
- `PATCH /books/:id` : update a book
- `DELETE /books/:id` : delete a book
- `POST /borrows` : borrow a book
- `GET /borrows` : borrows of one user
- `DELETE /borrows/:id` : return a book