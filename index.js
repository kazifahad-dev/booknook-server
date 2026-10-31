const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const client = new MongoClient(process.env.MONGODB_URI);

async function run() {
  try {
    await client.connect();
    await client.db("booknookDB").command({ ping: 1 });
    console.log("MongoDB connected successfully");

    const db = client.db("booknookDB");
    const booksCollection = db.collection("books");
    const borrowsCollection = db.collection("borrows");

    // ==================== BOOKS ====================

    // সব বই (নতুন আগে)। ?limit=6 দিলে শুধু ৬টা আসবে
    app.get("/books", async (req, res) => {
      const limit = parseInt(req.query.limit) || 0;
      const books = await booksCollection
        .find()
        .sort({ addedAt: -1 })
        .limit(limit)
        .toArray();
      res.send(books);
    });

    // একটা বই
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

    // নতুন বই যোগ
    app.post("/books", async (req, res) => {
      const {
        title,
        author,
        category,
        image,
        description,
        totalCopies,
        userName,
        userEmail,
      } = req.body;

      if (
        !title ||
        !author ||
        !category ||
        !image ||
        !description ||
        !userEmail
      ) {
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
        userName,
        userEmail,
        addedAt: new Date(),
      };

      const result = await booksCollection.insertOne(newBook);
      res.status(201).send(result);
    });

    // বই আপডেট
    app.patch("/books/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid book id" });
      }

      const { title, author, category, image, description } = req.body;
      const updatedFields = { title, author, category, image, description };

      // যে ঘরগুলো পাঠানো হয়নি (undefined) সেগুলো বাদ দিই
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

      if (result.matchedCount === 0) {
        return res.status(404).send({ message: "Book not found" });
      }
      res.send(result);
    });

    // বই ডিলিট
    app.delete("/books/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid book id" });
      }

      const result = await booksCollection.deleteOne({
        _id: new ObjectId(id),
      });

      if (result.deletedCount === 0) {
        return res.status(404).send({ message: "Book not found" });
      }
      res.send(result);
    });

    // ==================== BORROWS ====================

    // বই ধার নেওয়া
    app.post("/borrows", async (req, res) => {
      const { bookId, userName, userEmail } = req.body;

      if (!bookId || !userEmail) {
        return res
          .status(400)
          .send({ message: "Book id and email are required" });
      }
      if (!ObjectId.isValid(bookId)) {
        return res.status(400).send({ message: "Invalid book id" });
      }

      const book = await booksCollection.findOne({ _id: new ObjectId(bookId) });
      if (!book) {
        return res.status(404).send({ message: "Book not found" });
      }

      // একই বই দুইবার ধার নেওয়া যাবে না
      const alreadyBorrowed = await borrowsCollection.findOne({
        bookId: new ObjectId(bookId),
        userEmail,
      });
      if (alreadyBorrowed) {
        return res
          .status(409)
          .send({ message: "You have already borrowed this book" });
      }

      // কপি থাকলে তবেই ১টা কমাও (খোঁজা আর কমানো একসাথে, এক ধাপে)
      const decrease = await booksCollection.updateOne(
        { _id: new ObjectId(bookId), availableCopies: { $gt: 0 } },
        { $inc: { availableCopies: -1 } },
      );
      if (decrease.modifiedCount === 0) {
        return res
          .status(400)
          .send({ message: "This book is not available right now" });
      }

      // ফেরত দেওয়ার তারিখ: আজ থেকে ৭ দিন পর
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

    // একজন ইউজারের ধার নেওয়া বইগুলো
    app.get("/borrows", async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }
      const borrows = await borrowsCollection
        .find({ userEmail: email })
        .sort({ borrowDate: -1 })
        .toArray();
      res.send(borrows);
    });

    // বই ফেরত দেওয়া
    app.delete("/borrows/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid borrow id" });
      }

      const borrow = await borrowsCollection.findOne({ _id: new ObjectId(id) });
      if (!borrow) {
        return res.status(404).send({ message: "Borrow record not found" });
      }

      await borrowsCollection.deleteOne({ _id: new ObjectId(id) });
      await booksCollection.updateOne(
        { _id: borrow.bookId },
        { $inc: { availableCopies: 1 } },
      );

      res.send({ message: "Book returned successfully" });
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
  }
}
run();

app.get("/", (req, res) => {
  res.send("BookNook server is running");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
