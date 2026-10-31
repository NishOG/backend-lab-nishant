const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
const port = 3000;
const databasePath = path.join(__dirname, 'books.db');
let db = null;

app.use(express.json());

function isValidBook(book) {
  return (
    book !== null &&
    typeof book === 'object' &&
    !Array.isArray(book) &&
    typeof book.title === 'string' &&
    book.title.trim().length > 0 &&
    typeof book.author === 'string' &&
    book.author.trim().length > 0 &&
    Number.isInteger(book.price) &&
    book.price >= 0 &&
    Number.isInteger(book.pages) &&
    book.pages > 0
  );
}

function getBookId(request, response) {
  const bookId = Number(request.params.bookId);

  if (!Number.isInteger(bookId) || bookId <= 0) {
    response.status(400).json({ error: 'bookId must be a positive integer.' });
    return null;
  }

  return bookId;
}

app.get('/books/', async (request, response) => {
  const books = await db.all('SELECT * FROM book ORDER BY id');
  response.status(200).json(books);
});

app.get('/books/:bookId/', async (request, response) => {
  const bookId = getBookId(request, response);
  if (bookId === null) return;

  const book = await db.get('SELECT * FROM book WHERE id = ?', [bookId]);
  if (!book) {
    response.status(404).json({ error: 'Book not found.' });
    return;
  }

  response.status(200).json(book);
});

app.post('/books/', async (request, response) => {
  if (!isValidBook(request.body)) {
    response.status(400).json({
      error: 'title and author must be non-empty strings, price a non-negative integer, and pages a positive integer.'
    });
    return;
  }

  const { title, author, price, pages } = request.body;
  const result = await db.run(
    'INSERT INTO book (title, author, price, pages) VALUES (?, ?, ?, ?)',
    [title.trim(), author.trim(), price, pages]
  );
  const createdBook = await db.get('SELECT * FROM book WHERE id = ?', [result.lastID]);

  response.status(201).json(createdBook);
});

app.put('/books/:bookId/', async (request, response) => {
  const bookId = getBookId(request, response);
  if (bookId === null) return;

  if (!isValidBook(request.body)) {
    response.status(400).json({
      error: 'title and author must be non-empty strings, price a non-negative integer, and pages a positive integer.'
    });
    return;
  }

  const { title, author, price, pages } = request.body;
  const result = await db.run(
    'UPDATE book SET title = ?, author = ?, price = ?, pages = ? WHERE id = ?',
    [title.trim(), author.trim(), price, pages, bookId]
  );

  if (result.changes === 0) {
    response.status(404).json({ error: 'Book not found.' });
    return;
  }

  const updatedBook = await db.get('SELECT * FROM book WHERE id = ?', [bookId]);
  response.status(200).json(updatedBook);
});

app.delete('/books/:bookId/', async (request, response) => {
  const bookId = getBookId(request, response);
  if (bookId === null) return;

  const result = await db.run('DELETE FROM book WHERE id = ?', [bookId]);
  if (result.changes === 0) {
    response.status(404).json({ error: 'Book not found.' });
    return;
  }

  response.status(200).json({ message: 'Book deleted successfully.' });
});

app.use((request, response) => {
  response.status(404).json({ error: 'Route not found.' });
});

app.use((error, request, response, next) => {
  console.error('Request failed:', error.message);
  response.status(500).json({ error: 'Internal server error.' });
});

async function initializeDBAndServer() {
  try {
    db = await open({
      filename: databasePath,
      driver: sqlite3.Database
    });

    app.listen(port, () => {
      console.log(`Server is running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    process.exitCode = 1;
  }
}

initializeDBAndServer();
