const http = require('http');

const server = http.createServer((request, response) => {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.end('Hello');
});

server.listen(3000, () => {
  console.log('Basic HTTP server is running at http://localhost:3000');
});
