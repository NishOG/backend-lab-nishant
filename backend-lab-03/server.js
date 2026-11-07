const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const app = express();
const PORT = process.env.PORT || 3000;

// Lab 3 reuses the Lab 2 database. Copy books.db into this folder.
const dbPath = path.join(__dirname, "books.db");

app.use(express.json());

let db;

// Allowed sort columns prevent users from supplying arbitrary SQL identifiers.
const allowedSortColumns = ["id", "title", "author", "price", "pages"];

function sendError(res, status, message) {
  return res.status(status).json({ message });
}

function parsePrice(price) {
  if (
    (typeof price !== "number" && typeof price !== "string") ||
    (typeof price === "string" && price.trim() === "")
  ) {
    return null;
  }

  const numericPrice = Number(price);
  if (!Number.isSafeInteger(numericPrice) || numericPrice < 0) {
    return null;
  }

  return numericPrice;
}

function parseOptionalNumber(value, name, res, options = {}) {
  if (value === undefined) return undefined;

  const number = Number(value);
  if (!Number.isInteger(number)) {
    sendError(res, 400, `${name} must be a valid integer.`);
    return null;
  }

  if (options.min !== undefined && number < options.min) {
    sendError(res, 400, `${name} must be at least ${options.min}.`);
    return null;
  }

  return number;
}

// GET /books/?search_q=python&order_by=price&order=DESC&limit=5&offset=0
//       &min_price=100&max_price=1000
app.get("/books/", async (req, res) => {
  try {
    const {
      search_q,
      order_by = "title",
      order = "ASC"
    } = req.query;

    const limit = parseOptionalNumber(req.query.limit ?? "10", "limit", res, { min: 1 });
    if (limit === null) return;

    const offset = parseOptionalNumber(req.query.offset ?? "0", "offset", res, { min: 0 });
    if (offset === null) return;

    const minPrice = parseOptionalNumber(req.query.min_price, "min_price", res, { min: 0 });
    if (minPrice === null) return;

    const maxPrice = parseOptionalNumber(req.query.max_price, "max_price", res, { min: 0 });
    if (maxPrice === null) return;

    if (!allowedSortColumns.includes(order_by)) {
      return sendError(res, 400, `order_by must be one of: ${allowedSortColumns.join(", ")}.`);
    }

    const sortDirection = String(order).toUpperCase();
    if (!["ASC", "DESC"].includes(sortDirection)) {
      return sendError(res, 400, "order must be ASC or DESC.");
    }

    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      return sendError(res, 400, "min_price cannot be greater than max_price.");
    }

    const conditions = [];
    const values = [];

    if (search_q !== undefined && String(search_q).trim() !== "") {
      conditions.push("title LIKE ?");
      values.push(`%${String(search_q).trim()}%`);
    }

    if (minPrice !== undefined) {
      conditions.push("price >= ?");
      values.push(minPrice);
    }

    if (maxPrice !== undefined) {
      conditions.push("price <= ?");
      values.push(maxPrice);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    // order_by and sortDirection are safe because they are validated above.
    const sql = `
      SELECT * FROM book
      ${whereClause}
      ORDER BY ${order_by} ${sortDirection}
      LIMIT ? OFFSET ?
    `;

    values.push(limit, offset);
    const books = await db.all(sql, values);
    return res.status(200).json(books);
  } catch (error) {
    console.error("GET /books/ error:", error.message);
    return sendError(res, 500, "Unable to retrieve books.");
  }
});

// GET one book
app.get("/books/:bookId/", async (req, res) => {
  try {
    const bookId = Number(req.params.bookId);
    if (!Number.isInteger(bookId) || bookId <= 0) {
      return sendError(res, 400, "bookId must be a positive integer.");
    }

    const book = await db.get("SELECT * FROM book WHERE id = ?", [bookId]);
    if (!book) return sendError(res, 404, "Book not found.");

    return res.status(200).json(book);
  } catch (error) {
    console.error("GET book error:", error.message);
    return sendError(res, 500, "Unable to retrieve the book.");
  }
});

// POST a new book
app.post("/books/", async (req, res) => {
  try {
    const { title, author, price, pages } = req.body || {};
    const numericPrice = parsePrice(price);

    if (typeof title !== "string" || title.trim() === "") {
      return sendError(res, 400, "Title is required.");
    }
    if (typeof author !== "string" || author.trim() === "") {
      return sendError(res, 400, "Author is required.");
    }
    if (numericPrice === null) {
      return sendError(res, 400, "Price must be a non-negative integer.");
    }

    let pageCount = 0;
    if (pages !== undefined) {
      if (!Number.isInteger(Number(pages)) || Number(pages) <= 0) {
        return sendError(res, 400, "Pages must be a positive integer.");
      }
      pageCount = Number(pages);
    }

    const result = await db.run(
      "INSERT INTO book (title, author, price, pages) VALUES (?, ?, ?, ?)",
      [title.trim(), author.trim(), numericPrice, pageCount]
    );

    return res.status(201).json({
      message: "Book created successfully.",
      bookId: result.lastID
    });
  } catch (error) {
    console.error("POST /books/ error:", error.message);
    return sendError(res, 500, "Unable to create book.");
  }
});

// PUT updates an existing book
app.put("/books/:bookId/", async (req, res) => {
  try {
    const bookId = Number(req.params.bookId);
    if (!Number.isInteger(bookId) || bookId <= 0) {
      return sendError(res, 400, "bookId must be a positive integer.");
    }

    const { title, author, price, pages } = req.body || {};
    const numericPrice = parsePrice(price);
    if (typeof title !== "string" || title.trim() === "") {
      return sendError(res, 400, "Title is required.");
    }
    if (typeof author !== "string" || author.trim() === "") {
      return sendError(res, 400, "Author is required.");
    }
    if (numericPrice === null) {
      return sendError(res, 400, "Price must be a non-negative integer.");
    }
    if (pages === undefined || !Number.isInteger(Number(pages)) || Number(pages) <= 0) {
      return sendError(res, 400, "Pages must be a positive integer.");
    }

    const existingBook = await db.get("SELECT id FROM book WHERE id = ?", [bookId]);
    if (!existingBook) return sendError(res, 404, "Book not found.");

    await db.run(
      "UPDATE book SET title = ?, author = ?, price = ?, pages = ? WHERE id = ?",
      [title.trim(), author.trim(), numericPrice, Number(pages), bookId]
    );

    return res.status(200).json({ message: "Book updated successfully." });
  } catch (error) {
    console.error("PUT book error:", error.message);
    return sendError(res, 500, "Unable to update book.");
  }
});

// DELETE a book
app.delete("/books/:bookId/", async (req, res) => {
  try {
    const bookId = Number(req.params.bookId);
    if (!Number.isInteger(bookId) || bookId <= 0) {
      return sendError(res, 400, "bookId must be a positive integer.");
    }

    const existingBook = await db.get("SELECT id FROM book WHERE id = ?", [bookId]);
    if (!existingBook) return sendError(res, 404, "Book not found.");

    await db.run("DELETE FROM book WHERE id = ?", [bookId]);
    return res.status(200).json({ message: "Book deleted successfully." });
  } catch (error) {
    console.error("DELETE book error:", error.message);
    return sendError(res, 500, "Unable to delete book.");
  }
});

// Open SQLite first; start Express only after the connection succeeds.
async function initializeDBAndServer() {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    // Check that the expected table exists before listening.
    const table = await db.get(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      ["book"]
    );

    if (!table) {
      throw new Error("Table 'book' was not found in books.db. Check the database file.");
    }

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log(`Using database: ${dbPath}`);
    });
  } catch (error) {
    console.error("Database/server initialization failed:", error.message);
    process.exit(1);
  }
}

initializeDBAndServer();
