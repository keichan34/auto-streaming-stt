import express from 'express';
import http from 'node:http';
import url from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

import { WebSocket, WebSocketServer } from 'ws';

import Transcription from './transcription';
import * as webpush from './webpush';

const app = express();
app.enable('trust proxy');

app.use(express.json());

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

app.use(function(request, response, next) {
  if (process.env.NODE_ENV !== 'development' && !request.secure) {
    return response.redirect("https://" + request.headers.host + request.url);
  }

  next();
});

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
      if (extname === '.mp3') {
        res.setHeader('Content-Type', 'audio/mpeg');
      } else if (extname === '.txt') {
        res.setHeader('Content-Type', 'text/plain');
      } else if (extname === '.json') {
        res.setHeader('Content-Type', 'application/json');
      }
    },
  }
));

app.get('/api/streams', (_req, res) => {
  (async () => {
    const outDir = path.join(__dirname, '..', 'out');
    const files = await fs.promises.readdir(outDir);
    const streamIds = files
      .filter((file) => file.endsWith('.mp3'))
      .map((file) => path.basename(file, '.mp3'))
      .filter((streamId) => streamId !== currentStreamId)
      .filter((streamId) => {
        const txtFile = path.join(outDir, `${streamId}.txt`);
        // if the text file is empty, no transcription was made,
        // so we can ignore this stream
        if (!fs.existsSync(txtFile)) { return false; }
        const stat = fs.statSync(txtFile);
        return stat.size > 0;
      });
    // sort by date, newest first
    streamIds.sort((a, b) => (a > b ? -1 : 1));
    // keep the latest 20
    streamIds.splice(20);

    return streamIds;
  })().then((resp) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json(resp);
  });
});

app.get('/api/push/public-key', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.json({ publicKey: webpush.publicKey });
});

app.post('/api/push/subscribe', (req, res) => {
  const { subscription } = req.body;
  if (!subscription) {
    res.status(400).send('Missing subscription');
    return;
  }
  (async () => {
    await webpush.subscribe(subscription);
  })().then(() => {
    res.status(200).json({error: false});
  });
});

server.on('upgrade', (req, socket, head) => {
  const { pathname } = url.parse(req.url || '');
  if (pathname === '/api/ws' || pathname === '/ws') {
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

  transcription.on('streamEnded', ({ contentLength }) => {
    if (contentLength > 0) {
      webpush.broadcast(JSON.stringify({
        type: 'streamEnded',
        streamId: currentStreamId,
      }));
    }
    currentStreamId = null;
  });
}

export default serve;
