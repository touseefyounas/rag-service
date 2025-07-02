import express from 'express';
import { finalStream, initializeSystem, isSystemInitialized } from './service';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import cors from 'cors';
import { loadAndSplitChunks } from './functions';

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

import { Request, Response } from 'express';

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

    await initializeSystem(splitDocs);

    if (fs.existsSync(uploadedPath)) {
      fs.unlinkSync(uploadedPath);
    }

    res.json({ message: 'File processed and system initialized successfully' });
  } catch (err) {
    console.error('Error processing PDF:', err);
    res.status(500).json({ error: 'Failed to process PDF' });
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
