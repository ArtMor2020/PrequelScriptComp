// Integration tests for the HTTP execution stream, interactive input, and
// example-loading endpoint.

const assert = require('node:assert/strict');
const test = require('node:test');

const { app } = require('../server');
const { tokenize } = require('./lexer');
const { parse } = require('./parser');

test('execution accepts input after the program has started and written output', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  let eventReader;

  try {
    const compileResponse = await fetch(`${baseUrl}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: [
          'THIS IS WHERE THE FUN BEGINS',
          'JEDI age;',
          'HELLO THERE ("Age? ");',
          'GENERAL KENOBI ("%d", &age);',
          'HELLO THERE ("age=%d", age);',
          'ANOTHER HAPPY ENDING'
        ].join('\n')
      })
    });
    const compileResult = await compileResponse.json();

    assert.equal(compileResponse.status, 200);
    assert.ok(compileResult.jobId);
    assert.match(compileResult.generatedCode, /_next_input_value/);

    const eventsResponse = await fetch(`${baseUrl}/compile/${compileResult.jobId}/events`);
    assert.equal(eventsResponse.status, 200);
    eventReader = eventsResponse.body.getReader();

    const decoder = new TextDecoder();
    let bufferedEvents = '';
    let output = '';
    let sentInput = false;
    let finished = false;

    while (!finished) {
      let timeout;
      const read = await Promise.race([
        eventReader.read(),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Execution event stream timed out.')), 5000);
        })
      ]).finally(() => clearTimeout(timeout));
      assert.equal(read.done, false);
      bufferedEvents += decoder.decode(read.value, { stream: true });

      const eventBlocks = bufferedEvents.split('\n\n');
      bufferedEvents = eventBlocks.pop();
      for (const block of eventBlocks) {
        const eventName = block.match(/^event: (.+)$/m);
        const eventData = block.match(/^data: (.+)$/m);
        if (!eventName || !eventData) continue;

        const data = JSON.parse(eventData[1]);
        if (eventName[1] === 'output') {
          output += data.text;
          if (!sentInput && output.includes('Age? ')) {
            sentInput = true;
            const inputResponse = await fetch(`${baseUrl}/compile/${compileResult.jobId}/input`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ input: '42' })
            });
            assert.equal(inputResponse.status, 200);
          }
        } else if (eventName[1] === 'exit') {
          finished = true;
          assert.equal(data.code, 0);
        } else if (eventName[1] === 'error') {
          assert.fail(data.message);
        }
      }
    }

    assert.equal(sentInput, true);
    assert.equal(output, 'Age? age=42');
  } finally {
    if (eventReader) await eventReader.cancel();
    await new Promise(resolve => server.close(resolve));
  }
});

test('examples endpoint returns labeled source programs that parse', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/examples`);
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(result.examples.map(example => example.name), [
      'Bubble sort example',
      'Age trial example',
      'Recursive factorial example',
      'Recursive binary search example',
      'Input, decision, and loop example',
      'Greatest common divisor function',
      'Recursive Fibonacci function'
    ]);

    for (const example of result.examples) {
      const lexResult = tokenize(example.code);
      assert.equal(lexResult.success, true, `${example.name}: ${lexResult.error}`);
      const parseResult = parse(lexResult.tokens);
      assert.equal(parseResult.success, true, `${example.name}: ${parseResult.error}`);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
