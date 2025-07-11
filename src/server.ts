require('dotenv').config();

import express from 'express';
import { Request, Response } from 'express';
import cors from 'cors';

import path from 'path';
import fs from 'fs';
import multer from 'multer';

import { Redis } from '@upstash/redis';

import { addDocumentsToVectorStore, loadAndSplitChunks } from './RAG/ragFunctions';
import { finalStream, initializeSystem, isSystemInitialized, resetDocuments, documentStatus } from './service';
import { getMemoryInstance } from './Config/redis';
import { get } from 'http';

const app = express();
const PORT = process.env.PORT || 3000;

const client = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

app.post('/validate', async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    res.status(400).json({ error: 'Session ID is required' });
    return;
  }

  try {
    const exists = await client.sismember("session_ids", sessionId);
    if (exists) {
      await initializeSystem(sessionId);
      res.json({ valid: true, message: 'Session found' });

    } else {
      res.status(404).json({ valid: false, message: 'Session not found' });
    }
  } catch (error) {
    console.error("Redis error:", error);
    res.status(500).json({ error: 'Server error validating session' });
  }
});

app.post('/initialize', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    res.status(400).json({ error: 'Session ID is required' });
  }

  try {
    const exists = await client.sismember("session_ids", sessionId);
    if (exists) {
      res.status(400).json({ valid: false, error: 'Session already initialized' });
      return;
    }

    await client.sadd("session_ids", sessionId);
    await initializeSystem(sessionId);
    res.json({ valid: true, message: 'Session initialized successfully' });
  } catch (error) {
    console.error("Redis error:", error);
    res.status(500).json({ valid:false, error: 'Server error initializing session' });
  }
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
  
  const sessionId = req.headers['x-session-id'] as string;
  if (!sessionId) {
    res.status(400).json({ error: 'Session ID is required' });
    return;
  }

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

    await addDocumentsToVectorStore(splitDocs, sessionId);

    if (fs.existsSync(uploadedPath)) {
      fs.unlinkSync(uploadedPath);
    }

    res.json({ message: 'File processed and system initialized successfully' });
  } catch (err) {
    console.error('Error processing PDF:', err);
    res.status(500).json({ error: 'Failed to process PDF' });
  }
});

app.get('/document/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  try {
    const stats = await documentStatus(sessionId);
    res.json(stats);
  } catch (err) {
    console.error('Error fetching document status:', err);
    res.status(500).json({ error: 'Failed to fetch document status' });
  }
});

app.delete('/reset/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  try {
    await resetDocuments(sessionId);
    res.json({ message: 'Documents reset successfully' });
  } catch (err) {
    console.error('Error resetting system:', err);
    res.status(500).json({ error: 'Failed to reset system' });
  }
});

app.post('/ask', async (req, res) => {
  try {
    const { sessionId, question, mode } = req.body;

    if (!sessionId || !question) {
      res.status(400).json({ error: 'sessionId and question are required' });
      return;
    }

    const stream = await finalStream(sessionId, question, mode);
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

app.get('/history/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const memory = getMemoryInstance(sessionId);
  if (!memory) {
    res.status(404).json({ error: 'Session not found' });
    
  }
  try{
    const chatHistory = await memory.chatHistory.getMessages();
    res.status(200).json(chatHistory);
  } catch (err) {
    console.error('Error fetching chat history:', err);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});
  



app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
