import express from 'express';
import http from 'node:http';
import url from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

import { WebSocket, WebSocketServer } from 'ws';

import Transcription from './transcription';

const app = express();
const wss = new WebSocketServer({ noServer: true });
const server = http.createServer(app);

let currentStreamId: string | null = null;

wss.on('connection', (ws, _request) => {
  ws.on('error', console.error);
  // ws.on('message', function message(data, isBinary) {
  //   console.log(`Received message ${data}`);
  //   wss.clients.forEach((client) => {
  //     if (client.readyState === WebSocket.OPEN) {
  //       client.send(data, { binary: isBinary });
  //     }
  //   });
  // });
});

function broadcastMessage(message: string | Buffer) {
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) { continue; }
    client.send(message);
  }
}

app.use('/static', express.static(
  path.join(__dirname, '..', 'frontend', 'build', 'static'),
  { maxAge: 31536000000, immutable: true }
));
app.use(express.static(
  path.join(__dirname, '..', 'frontend', 'build'),
));

app.use('/api/streams', express.static(
  path.join(__dirname, '..', 'out'),
  {
    index: false,
    setHeaders(res, localPath) {
      const extname = path.extname(localPath);
      const basename = path.basename(localPath, extname);
      if (basename === currentStreamId) {
        res.setHeader('Cache-Control', 'no-store');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }
));

app.get('/api/streams', (_req, res) => {
  (async () => {
    const files = await fs.promises.readdir(path.join(__dirname, '..', 'out'));
    const allMp3s = files.filter((file) => file.endsWith('.mp3'));
    // sort by date, newest first
    allMp3s.sort((a, b) => (a > b ? -1 : 1));
    // keep the latest 20
    allMp3s.splice(20);
    return allMp3s.map((file) => {
      const streamId = path.basename(file, '.mp3');
      return streamId;
    }).filter((streamId) => streamId !== currentStreamId);
  })().then((resp) => {
    res.json(resp);
  });
});

server.on('upgrade', (req, socket, head) => {
  const { pathname } = url.parse(req.url || '');
  if (pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

async function serve(transcription: Transcription) {
  server.listen(parseInt(process.env.PORT || '3000', 10), () => {
    console.log(`Listening on port ${process.env.PORT || '3000'}`);
  });

  const events = ['streamStarted', 'transcript', 'streamEnded'];
  for (const event of events) {
    transcription.on(event, (data) => {
      broadcastMessage(JSON.stringify({
        type: event,
        data,
      }));
    });
  }

  transcription.on('streamStarted', ({ streamId }) => {
    currentStreamId = streamId;
  });

  transcription.on('streamEnded', () => {
    currentStreamId = null;
  });
}

export default serve;
