import * as http from 'node:http';

const PORT = 3000;

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end('Hello world');
});

server.listen(PORT, () => {
  console.log('port is listening on port', PORT);
});