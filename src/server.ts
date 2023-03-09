import http2 from 'node:http2';
import http2Express from 'http2-express-bridge';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

const app = http2Express(express);

app.get('/hi', (req, res) => {
  res.send('<h1>hi there</h1>');
});

async function serve() {
  const server = http2.createSecureServer({
    key: await fs.promises.readFile(path.join('.', 'data', 'tls.key')),
    cert: await fs.promises.readFile(path.join('.', 'data', 'tls.pem')),
    allowHTTP1: true,
  }, app);

  await new Promise((_resolve, _reject) => {
    server.listen(parseInt(process.env.PORT || '3000', 10));
  });
}

export default serve;
