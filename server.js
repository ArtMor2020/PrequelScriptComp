// Serves the IDE, runs the lexer/parser/semantic/code-generation pipeline,
// and streams generated Python execution and interactive input to the browser.

const express = require('express');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

const { tokenize } = require('./compiler/lexer');
const { parse } = require('./compiler/parser');
const { analyze } = require('./compiler/semantic');
const { generateCode } = require('./compiler/codegen');

const EXECUTION_TIMEOUT_MS = 60_000;
const JOB_RETENTION_MS = 60_000;
const MAX_OUTPUT_BYTES = 1_000_000;
const EXAMPLES_FILE = path.join(__dirname, 'Examples.txt');

const app = express();
const jobs = new Map();

app.use(express.json());

app.get('/examples', (req, res) => {
  try {
    const source = fs.readFileSync(EXAMPLES_FILE, 'utf8');
    const examples = [];
    let current = null;

    // Example headings delimit source snippets in the shared examples text file.
    for (const line of source.split(/\r?\n/)) {
      const heading = line.match(/^\s*DID YOU EVER HEAR THE TRAGEDY OF DARTH PLAGUEIS THE WISE\s+(.+?)\s*$/);
      if (heading) {
        if (current && current.code.length > 0) {
          current.code = current.code.join('\n').trim();
          examples.push(current);
        }
        current = { name: heading[1], code: [] };
      } else if (current) {
        current.code.push(line);
      } else if (line.trim()) {
        return res.status(500).json({ error: 'Examples.txt must start with an example heading.' });
      }
    }

    if (current && current.code.length > 0) {
      current.code = current.code.join('\n').trim();
      examples.push(current);
    }

    return res.json({ examples });
  } catch (error) {
    return res.status(500).json({ error: `Unable to load examples: ${error.message}` });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

function emit(job, event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  // Retain events so a browser connecting after execution starts can catch up.
  job.events.push(message);
  for (const client of job.clients) client.write(message);
}

function finishJob(job, details) {
  if (job.done) return;

  job.done = true;
  clearTimeout(job.timeout);
  emit(job, 'exit', details);
  for (const client of job.clients) client.end();
  job.clients.clear();

  // Remove generated source now; keep final events briefly for reconnects.
  if (fs.existsSync(job.filePath)) fs.unlinkSync(job.filePath);
  job.cleanup = setTimeout(() => jobs.delete(job.id), JOB_RETENTION_MS);
  job.cleanup.unref();
}

app.post('/compile', (req, res) => {
  const { code } = req.body || {};
  if (typeof code !== 'string') {
    return res.status(400).json({ error: 'Source code must be a string.' });
  }

  try {
    const lexResult = tokenize(code);
    if (!lexResult.success) return res.json({ error: lexResult.error });

    const parseResult = parse(lexResult.tokens);
    if (!parseResult.success) return res.json({ error: parseResult.error });

    const semanticResult = analyze(parseResult.ast);
    if (!semanticResult.success) return res.json({ error: semanticResult.error });

    const pythonCode = generateCode(parseResult.ast);
    const id = crypto.randomBytes(16).toString('hex');
    const filePath = path.join(os.tmpdir(), `star-wars-compiler-${id}.py`);
    fs.writeFileSync(filePath, pythonCode);

    const child = spawn(process.env.PYTHON || 'python', ['-u', filePath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    const job = {
      id,
      filePath,
      child,
      clients: new Set(),
      events: [],
      done: false,
      outputBytes: 0,
      outputLimited: false,
      timeout: null,
      cleanup: null
    };
    jobs.set(id, job);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => {
      if (job.outputLimited) return;
      job.outputBytes += Buffer.byteLength(data);
      // Bound combined stdout/stderr to prevent runaway programs filling memory.
      if (job.outputBytes > MAX_OUTPUT_BYTES) {
        job.outputLimited = true;
        emit(job, 'error', { message: 'Program output exceeded the 1 MB limit.' });
        child.kill();
        return;
      }
      emit(job, 'output', { text: data });
    });
    child.stderr.on('data', data => {
      if (job.outputLimited) return;
      job.outputBytes += Buffer.byteLength(data);
      if (job.outputBytes > MAX_OUTPUT_BYTES) {
        job.outputLimited = true;
        emit(job, 'error', { message: 'Program output exceeded the 1 MB limit.' });
        child.kill();
        return;
      }
      emit(job, 'error', { message: data });
    });
    child.on('error', error => {
      emit(job, 'error', { message: error.message });
      finishJob(job, { code: null, signal: null });
    });
    child.stdin.on('error', error => {
      if (error.code !== 'EPIPE') emit(job, 'error', { message: error.message });
    });
    child.on('close', (code, signal) => {
      finishJob(job, { code, signal });
    });
    job.timeout = setTimeout(() => {
      emit(job, 'error', { message: 'Program execution timed out after 60 seconds.' });
      child.kill();
    }, EXECUTION_TIMEOUT_MS);
    job.timeout.unref();

    return res.json({ jobId: id, generatedCode: pythonCode });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/compile/:jobId/events', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Execution not found or expired.' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();
  for (const event of job.events) res.write(event);

  if (job.done) {
    res.end();
    return;
  }

  job.clients.add(res);
  res.on('close', () => job.clients.delete(res));
});

app.post('/compile/:jobId/input', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || job.done) return res.status(410).json({ error: 'Program is no longer waiting for input.' });

  const { input } = req.body || {};
  if (typeof input !== 'string' || /[\r\n]/.test(input)) {
    return res.status(400).json({ error: 'Input must be a single line of text.' });
  }

  if (!job.child.stdin.writable) {
    return res.status(410).json({ error: 'Program is no longer accepting input.' });
  }

  job.child.stdin.write(`${input}\n`);
  return res.json({ accepted: true });
});

app.post('/compile/:jobId/cancel', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || job.done) return res.status(410).json({ error: 'Program is no longer running.' });

  job.child.kill();
  return res.json({ cancelled: true });
});

if (require.main === module) {
  app.listen(3000, () => console.log('Compiler IDE running at http://localhost:3000'));
}

module.exports = { app };
