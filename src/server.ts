import express from 'express';
import { finalStream } from './service';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

const upload = multer({
  dest: path.join(__dirname, 'uploads/'), 
  limits: { fileSize: 10 * 1024 * 1024 }, 
});

app.post('/upload', upload.single('pdf'), (req, res) => {

  const uploadedPath = req.file?.path;

  try {
    // if (uploadedPath) {
    //   fs.unlinkSync(uploadedPath);
    // }

    res.json({ message: 'File processed' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to process PDF');
  }
});


app.post('/ask', async (req, res) => {
  const { sessionId, question } = req.body;

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
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
