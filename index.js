const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose");

const app = express();
const port = process.env.PORT || 5000;


app.use(cors());
app.use(express.json());


const client = new MongoClient(process.env.MONGODB_URI);
let booksCollection;
let borrowsCollection;


async function connectDB() {
  if (booksCollection) return;
  await client.connect();
  const db = client.db("booknookDB");
  booksCollection = db.collection("books");
  borrowsCollection = db.collection("borrows");
  console.log("MongoDB connected successfully");
}


app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    res.status(500).send({ message: "Database connection failed" });
  }
});


let jwks;

const verifyToken = async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).send({ message: "Unauthorized: token missing" });
  }

  try {
    
    if (!jwks) {
      jwks = createRemoteJWKSet(
        new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
      );
    }

    const { payload } = await jwtVerify(token, jwks, {
      issuer: process.env.CLIENT_URL,
    });

    if (!payload.email) {
      return res.status(401).send({ message: "Unauthorized: invalid token" });
    }

    
    req.user = { email: payload.email, name: payload.name };
    next();
  } catch (error) {
    console.error("JWT verification failed:", error.message);
    return res.status(401).send({ message: "Unauthorized: invalid token" });
  }
};

app.get("/", (req, res) => {
  res.send("BookNook server is running");
});




app.get("/books", async (req, res) => {
  const limit = parseInt(req.query.limit) || 0;
  const email = req.query.email;
  const filter = email ? { userEmail: email } : {};

  const books = await booksCollection
    .find(filter)
    .sort({ addedAt: -1 })
    .limit(limit)
    .toArray();
  res.send(books);
});


app.get("/books/:id", async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid book id" });
  }
  const book = await booksCollection.findOne({ _id: new ObjectId(id) });
  if (!book) {
    return res.status(404).send({ message: "Book not found" });
  }
  res.send(book);
});


app.post("/books", verifyToken, async (req, res) => {
  const { title, author, category, image, description, totalCopies } = req.body;

  if (!title || !author || !category || !image || !description) {
    return res.status(400).send({ message: "All fields are required" });
  }

  const copies = Number(totalCopies);
  if (!copies || copies < 1) {
    return res
      .status(400)
      .send({ message: "Total copies must be at least 1" });
  }

  const newBook = {
    title,
    author,
    category,
    image,
    description,
    totalCopies: copies,
    availableCopies: copies,
    userName: req.user.name,
    userEmail: req.user.email,
    addedAt: new Date(),
  };

  const result = await booksCollection.insertOne(newBook);
  res.status(201).send(result);
});


app.patch("/books/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid book id" });
  }

  const book = await booksCollection.findOne({ _id: new ObjectId(id) });
  if (!book) {
    return res.status(404).send({ message: "Book not found" });
  }
  if (book.userEmail !== req.user.email) {
    return res
      .status(403)
      .send({ message: "Forbidden: you can only edit your own books" });
  }

  const { title, author, category, image, description } = req.body;
  const updatedFields = { title, author, category, image, description };

  
  Object.keys(updatedFields).forEach((key) => {
    if (updatedFields[key] === undefined) delete updatedFields[key];
  });

  if (Object.keys(updatedFields).length === 0) {
    return res.status(400).send({ message: "Nothing to update" });
  }

  const result = await booksCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updatedFields },
  );
  res.send(result);
});


app.delete("/books/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid book id" });
  }

  const book = await booksCollection.findOne({ _id: new ObjectId(id) });
  if (!book) {
    return res.status(404).send({ message: "Book not found" });
  }
  if (book.userEmail !== req.user.email) {
    return res
      .status(403)
      .send({ message: "Forbidden: you can only delete your own books" });
  }

  const result = await booksCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});




app.post("/borrows", verifyToken, async (req, res) => {
  const { bookId } = req.body;
  const userEmail = req.user.email;
  const userName = req.user.name;

  if (!bookId) {
    return res.status(400).send({ message: "Book id is required" });
  }
  if (!ObjectId.isValid(bookId)) {
    return res.status(400).send({ message: "Invalid book id" });
  }

  const book = await booksCollection.findOne({ _id: new ObjectId(bookId) });
  if (!book) {
    return res.status(404).send({ message: "Book not found" });
  }

  
  const alreadyBorrowed = await borrowsCollection.findOne({
    bookId: new ObjectId(bookId),
    userEmail,
  });
  if (alreadyBorrowed) {
    return res
      .status(409)
      .send({ message: "You have already borrowed this book" });
  }

  const decrease = await booksCollection.updateOne(
    { _id: new ObjectId(bookId), availableCopies: { $gt: 0 } },
    { $inc: { availableCopies: -1 } },
  );
  if (decrease.modifiedCount === 0) {
    return res
      .status(400)
      .send({ message: "This book is not available right now" });
  }

  
  const borrowDate = new Date();
  const returnDate = new Date();
  returnDate.setDate(returnDate.getDate() + 7);

  const newBorrow = {
    bookId: new ObjectId(bookId),
    bookTitle: book.title,
    bookImage: book.image,
    userName,
    userEmail,
    borrowDate,
    returnDate,
  };

  const result = await borrowsCollection.insertOne(newBorrow);
  res.status(201).send(result);
});


app.get("/borrows", verifyToken, async (req, res) => {
  const borrows = await borrowsCollection
    .find({ userEmail: req.user.email })
    .sort({ borrowDate: -1 })
    .toArray();
  res.send(borrows);
});


app.delete("/borrows/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid borrow id" });
  }

  const borrow = await borrowsCollection.findOne({ _id: new ObjectId(id) });
  if (!borrow) {
    return res.status(404).send({ message: "Borrow record not found" });
  }
  if (borrow.userEmail !== req.user.email) {
    return res
      .status(403)
      .send({ message: "Forbidden: this is not your borrow" });
  }

  await borrowsCollection.deleteOne({ _id: new ObjectId(id) });
  await booksCollection.updateOne(
    { _id: borrow.bookId },
    { $inc: { availableCopies: 1 } },
  );

  res.send({ message: "Book returned successfully" });
});


if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}


module.exports = app;