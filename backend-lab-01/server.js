const express = require('express');

const app = express();
const port = 3000;

app.use((request, response, next) => {
  response.on('finish', () => {
    console.log(`${request.method} ${request.originalUrl} ${response.statusCode}`);
  });
  next();
});

app.get('/', (request, response) => {
  response.status(200).send('Welcome to the Backend Development Fundamentals Lab 1 server.');
});

app.get('/about', (request, response) => {
  response.status(200).json({
    name: 'Nishant Kumar Thakur',
    section: 'CSE-DS-IB'
  });
});

app.get('/time', (request, response) => {
  response.status(200).send(new Date().toString());
});

app.use((request, response) => {
  response.status(404).send('404 - Route not found.');
});

app.listen(port, () => {
  console.log(`Express server is running at http://localhost:${port}`);
});
