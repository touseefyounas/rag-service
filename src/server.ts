import express from 'express';
import { Request, Response } from 'express';
import cors from 'cors';

import path from 'path';
import fs from 'fs';
import multer from 'multer';

import { loadAndSplitChunks } from './functions';
import { finalStream, initializeSystem, isSystemInitialized, resetSystem, documentStatus } from './service';


const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

app.get('/status', (req, res) => {
  res.json({ 
    status: 'running',
    systemInitialized: isSystemInitialized(),
    message: isSystemInitialized() ? 'System ready for questions' : 'Please upload a document first'
  });
});

const upload = multer({
  dest: path.join(__dirname, 'uploads/'), 
  limits: { fileSize: 10 * 1024 * 1024 }, 
});

app.post('/upload', upload.single('pdf'), async (req: Request, res: Response) => {
  try {
    const uploadedPath = req.file?.path;

    if (!uploadedPath) {
      res.status(400).json({ error: 'No file uploaded.' });
      return;
    }

    const splitDocs = await loadAndSplitChunks({
      chunkSize: 1536,
      chunkOverlap: 200,
      filepath: uploadedPath,
    });

    await initializeSystem(splitDocs, 'lecture');

    if (fs.existsSync(uploadedPath)) {
      fs.unlinkSync(uploadedPath);
    }

    res.json({ message: 'File processed and system initialized successfully' });
  } catch (err) {
    console.error('Error processing PDF:', err);
    res.status(500).json({ error: 'Failed to process PDF' });
  }
});

app.get('/document/status', async (req, res) => {
  try {
    const stats = await documentStatus('lecture');
    res.json(stats);
  } catch (err) {
    console.error('Error fetching document status:', err);
    res.status(500).json({ error: 'Failed to fetch document status' });
  }
});

app.delete('/reset', async (req, res) => {
  try {
    await resetSystem('lecture');
    res.json({ message: 'System reset successfully' });
  } catch (err) {
    console.error('Error resetting system:', err);
    res.status(500).json({ error: 'Failed to reset system' });
  }
});

app.post('/ask', async (req, res) => {
  try {
    const { sessionId, question } = req.body;

    if (!sessionId || !question) {
      res.status(400).json({ error: 'sessionId and question are required' });
      return;
    }

    const stream = await finalStream(sessionId, question);
    const reader = stream.getReader();

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }

    res.end();

  } catch (err) {
    console.error('Error in /ask endpoint:', err);
    if (err instanceof Error && err.message.includes('not initialized')) {
      res.status(400).json({ error: 'Please upload a document first before asking questions.' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
