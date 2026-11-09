// Connects the Monaco editor to the compiler API and manages examples,
// streamed execution output, and interactive program input.

let editor;
let activeJobId = null;
let eventSource = null;
let loadedExamples = [];

require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.38.0/min/vs' } });

require(['vs/editor/editor.main'], function () {
  monaco.languages.register({ id: 'prequelscript' });

  const phraseTokens = [
    ['THIS IS WHERE THE FUN BEGINS', 'keyword'],
    ['ANOTHER HAPPY ENDING', 'keyword'],
    ['HELLO THERE', 'keyword'],
    ['GENERAL KENOBI', 'keyword'],
    ['YOU WERE THE CHOSEN ONE', 'keyword'],
    ['YOU WERE SUPPOSED TO DESTROY THE SITH', 'keyword'],
    ['PERHAPS THE ARCHIVES ARE INCOMPLETE', 'keyword'],
    ['THIS IS GETTING OUT OF HAND', 'keyword'],
    ['I WANT MORE', 'keyword'],
    ['UNLIMITED POWAH', 'keyword'],
    ['DONT TRY IT', 'keyword'],
    ['YOU UNDERESTIMATE MY POWER', 'keyword'],
    ['KILL HIM', 'keyword'],
    ['KILL HIM NOW', 'keyword'],
    ['DO IT', 'keyword'],
    ['EXECUTE ORDER 66', 'keyword'],
    ['WHAT HAVE I DONE', 'keyword'],
    ['IS IT POSSIBLE TO LEARN THIS POWER', 'keyword'],
    ['NOT FROM A JEDI', 'keyword'],
    ['MASTER YODA', 'type'],
    ['JEDI', 'type'],
    ['YOUNGLING', 'type'],
    ['MASTER', 'type'],
    ['MASTER JEDI', 'type'],
    ['I HATE SAND', 'type'],
    ['HIGH GROUND', 'type'],
    ['SITH', 'type'],
    ['WOOKIEE', 'type'],
    ['YOU ARE A BOLD ONE', 'operator'],
    ['YOU ARE ON THIS COUNCIL', 'operator'],
    ['NOW THERE ARE TWO OF THEM', 'operator'],
    ['WE ARE STILL FLYING HALF A SHIP', 'operator'],
    ['NOOOO', 'operator'],
    ['THERE IS ALWAYS A BIGGER FISH', 'operator'],
    ['YOU ARE SHORTER THAN I EXPECTED', 'operator']
  ];
  const phraseRules = phraseTokens
    .sort(([left], [right]) => right.length - left.length)
    .map(([phrase, token]) => [
      new RegExp(`${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}(?![a-zA-Z0-9_])`),
      token
    ]);

  monaco.languages.setMonarchTokensProvider('prequelscript', {
    tokenizer: {
      root: [
        [/DID\s+YOU\s+EVER\s+HEAR\s+THE\s+TRAGEDY\s+OF\s+DARTH\s+PLAGUEIS\s+THE\s+WISE(?![a-zA-Z0-9_]).*/, 'comment'],
        ...phraseRules,
        [/\"(?:[^\"\\]|\\.)*\"/, 'string'],
        [/\d+(?:\.\d+)?/, 'number'],
        [/[a-zA-Z_][a-zA-Z0-9_]*/, {
          token: 'identifier'
        }]
      ]
    }
  });

  const initialCode = `THIS IS WHERE THE FUN BEGINS
    JEDI num YOU ARE ON THIS COUNCIL 5;
    HELLO THERE ("Hello Galaxy!", num);
ANOTHER HAPPY ENDING`;

  editor = monaco.editor.create(document.getElementById('monaco-editor-container'), {
    value: initialCode,
    language: 'prequelscript',
    theme: 'vs-dark',
    automaticLayout: true,
    fontSize: 14,
    minimap: { enabled: false }
  });

  document.getElementById('run-btn').addEventListener('click', runCompilation);
  document.getElementById('stop-btn').addEventListener('click', stopExecution);
  document.getElementById('terminal-form').addEventListener('submit', sendTerminalInput);
  document.getElementById('example-picker').addEventListener('change', loadSelectedExample);
  loadExamples();
});

async function loadExamples() {
  const picker = document.getElementById('example-picker');
  try {
    const response = await fetch('/examples');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);

    loadedExamples = result.examples;
    picker.replaceChildren(new Option('Choose an example...', ''));
    for (const [index, example] of loadedExamples.entries()) {
      picker.add(new Option(example.name, String(index)));
    }
    picker.disabled = loadedExamples.length === 0;
  } catch (error) {
    picker.replaceChildren(new Option(`Unable to load examples: ${error.message}`, ''));
    picker.disabled = true;
  }
}

async function loadSelectedExample() {
  const picker = document.getElementById('example-picker');
  if (!picker.value) return;

  try {
    const example = loadedExamples[Number(picker.value)];
    if (!example) throw new Error('The selected example is no longer available.');
    editor.setValue(example.code);
    monaco.editor.setModelMarkers(editor.getModel(), 'owner', []);
  } catch (error) {
    picker.add(new Option(`Unable to load example: ${error.message}`, ''));
    picker.value = '';
  }
}

function appendTerminal(text) {
  const output = document.getElementById('stdout-output');
  output.textContent += text;
  output.scrollTop = output.scrollHeight;
}

function setExecutionActive(active) {
  document.getElementById('run-btn').disabled = active;
  document.getElementById('stop-btn').disabled = !active;
  document.getElementById('terminal-input').disabled = !active;
  document.getElementById('send-input-btn').disabled = !active;
}

function markCompilationError(message) {
  const model = editor.getModel();
  const lineMatch = message.match(/line\s+(\d+)/i);
  const lineNumber = Math.max(1, Math.min(
    lineMatch ? parseInt(lineMatch[1], 10) : 1,
    model.getLineCount()
  ));

  monaco.editor.setModelMarkers(model, 'owner', [{
    startLineNumber: lineNumber,
    startColumn: 1,
    endLineNumber: lineNumber,
    endColumn: model.getLineMaxColumn(lineNumber),
    message,
    severity: monaco.MarkerSeverity.Error
  }]);
}

async function runCompilation() {
  const terminal = document.getElementById('stdout-output');
  const generatedCode = document.getElementById('generated-code');
  const model = editor.getModel();

  terminal.textContent = 'Compiling...\n';
  generatedCode.value = '';
  document.getElementById('terminal-input').value = '';
  monaco.editor.setModelMarkers(model, 'owner', []);

  try {
    const response = await fetch('/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: editor.getValue() })
    });
    const result = await response.json();

    if (!response.ok || result.error) {
      const message = result.error || `Compilation request failed (${response.status}).`;
      terminal.textContent = `[ERROR]\n${message}\n`;
      markCompilationError(message);
      return;
    }

    generatedCode.value = result.generatedCode;
    activeJobId = result.jobId;
    setExecutionActive(true);
    document.getElementById('terminal-input').focus();
    terminal.textContent = '';
    // The server streams stdout, errors, and process completion as separate events.
    eventSource = new EventSource(`/compile/${encodeURIComponent(activeJobId)}/events`);

    eventSource.addEventListener('output', event => {
      appendTerminal(JSON.parse(event.data).text);
    });
    eventSource.addEventListener('error', event => {
      if (event.data) appendTerminal(`\n[ERROR] ${JSON.parse(event.data).message}\n`);
    });
    eventSource.addEventListener('exit', event => {
      const details = JSON.parse(event.data);
      if (details.code !== 0 && details.code !== null && details.code !== undefined) {
        appendTerminal(`\n[Process exited with code ${details.code}]\n`);
      } else if (details.signal) {
        appendTerminal(`\n[Process stopped: ${details.signal}]\n`);
      }
      finishExecution();
    });
    eventSource.onerror = () => {
      if (eventSource && eventSource.readyState === EventSource.CLOSED && activeJobId) {
        appendTerminal('\n[Connection to execution output was lost.]\n');
        finishExecution();
      }
    };
  } catch (error) {
    terminal.textContent = `[SERVER ERROR]\n${error.message}`;
  }
}

async function sendTerminalInput(event) {
  event.preventDefault();
  if (!activeJobId) return;

  const input = document.getElementById('terminal-input');
  const value = input.value;
  try {
    const response = await fetch(`/compile/${encodeURIComponent(activeJobId)}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: value })
    });
    const result = await response.json();
    if (!response.ok) {
      appendTerminal(`\n[INPUT ERROR] ${result.error || response.statusText}\n`);
      return;
    }
    appendTerminal(`> ${value}\n`);
    input.value = '';
    input.focus();
  } catch (error) {
    appendTerminal(`\n[INPUT ERROR] ${error.message}\n`);
  }
}

async function stopExecution() {
  if (!activeJobId) return;
  try {
    await fetch(`/compile/${encodeURIComponent(activeJobId)}/cancel`, { method: 'POST' });
  } catch (error) {
    appendTerminal(`\n[STOP ERROR] ${error.message}\n`);
  }
}

function finishExecution() {
  activeJobId = null;
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  setExecutionActive(false);
}
