// Covers the compiler pipeline with lexer/parser/semantic regressions and
// execution checks for generated Python and bundled examples.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const { tokenize } = require('./lexer');
const { parse } = require('./parser');
const { analyze } = require('./semantic');
const { generateCode } = require('./codegen');

function parseSource(source) {
  const lexResult = tokenize(source);
  assert.equal(lexResult.success, true, lexResult.error);
  return parse(lexResult.tokens);
}

test('lexer keeps keyword prefixes inside identifiers', () => {
  const result = tokenize('JEDIx');

  assert.equal(result.success, true);
  assert.deepEqual(result.tokens.map(({ type, value }) => ({ type, value })), [
    { type: 'IDENTIFIER', value: 'JEDIx' }
  ]);
});

test('legacy comments discard the rest of their line', () => {
  const result = tokenize([
    'DID YOU EVER HEAR THE TRAGEDY OF DARTH PLAGUEIS THE WISE ignored tokens here',
    'JEDI value;'
  ].join('\n'));

  assert.equal(result.success, true);
  assert.deepEqual(result.tokens.map(token => token.value), ['JEDI', 'value', ';']);
});

test('lexer reports invalid characters with their source location', () => {
  const result = tokenize('THIS IS WHERE THE FUN BEGINS\nJEDI value @;\nANOTHER HAPPY ENDING');

  assert.equal(result.success, false);
  assert.match(result.error, /Unexpected character '@' at line 2, column 12/);
});

test('declarations inside conditionals are not visible after the conditional', () => {
  const result = parseSource([
    'THIS IS WHERE THE FUN BEGINS',
    'YOU WERE THE CHOSEN ONE (0)',
    'JEDI hidden YOU ARE ON THIS COUNCIL 1;',
    'ANOTHER HAPPY ENDING',
    'HELLO THERE (hidden);',
    'ANOTHER HAPPY ENDING'
  ].join('\n'));

  assert.equal(result.success, true, result.error);
  const semanticResult = analyze(result.ast);

  assert.equal(semanticResult.success, false);
  assert.match(semanticResult.error, /undeclared variable 'hidden'/);
});

test('declarations are available within their conditional branch', () => {
  const result = parseSource([
    'THIS IS WHERE THE FUN BEGINS',
    'YOU WERE THE CHOSEN ONE (1)',
    'JEDI local YOU ARE ON THIS COUNCIL 1;',
    'HELLO THERE (local);',
    'ANOTHER HAPPY ENDING',
    'ANOTHER HAPPY ENDING'
  ].join('\n'));

  assert.equal(result.success, true, result.error);
  assert.equal(analyze(result.ast).success, true);
});

test('alternate branch cannot use a declaration from the consequent branch', () => {
  const result = parseSource([
    'THIS IS WHERE THE FUN BEGINS',
    'YOU WERE THE CHOSEN ONE (1)',
    'JEDI branchOnly YOU ARE ON THIS COUNCIL 1;',
    'YOU WERE SUPPOSED TO DESTROY THE SITH',
    'HELLO THERE (branchOnly);',
    'ANOTHER HAPPY ENDING',
    'ANOTHER HAPPY ENDING'
  ].join('\n'));

  assert.equal(result.success, true, result.error);
  const semanticResult = analyze(result.ast);

  assert.equal(semanticResult.success, false);
  assert.match(semanticResult.error, /undeclared variable 'branchOnly'/);
});

test('parser reports recognized but unsupported language keywords', () => {
  const result = parseSource('NOT FROM A JEDI');

  assert.equal(result.success, false);
  assert.match(result.error, /Unsupported keyword 'NOT FROM A JEDI'/);
});

test('parser rejects missing statement terminators and trailing expression tokens', () => {
  const missingSemicolon = parseSource([
    'THIS IS WHERE THE FUN BEGINS',
    'JEDI count YOU ARE ON THIS COUNCIL 1',
    'ANOTHER HAPPY ENDING'
  ].join('\n'));
  const trailingToken = parseSource([
    'THIS IS WHERE THE FUN BEGINS',
    'JEDI count YOU ARE ON THIS COUNCIL 1 2;',
    'ANOTHER HAPPY ENDING'
  ].join('\n'));

  assert.equal(missingSemicolon.success, false);
  assert.match(missingSemicolon.error, /Expected ';' after statement/);
  assert.equal(trailingToken.success, false);
  assert.match(trailingToken.error, /Expected ';' after statement/);
});

test('semantic analysis rejects incompatible assignments and invalid arithmetic', () => {
  const result = parseSource([
    'THIS IS WHERE THE FUN BEGINS',
    'JEDI count YOU ARE ON THIS COUNCIL 1;',
    'count YOU ARE ON THIS COUNCIL "text";',
    'HELLO THERE (count + "text");',
    'ANOTHER HAPPY ENDING'
  ].join('\n'));

  assert.equal(result.success, true, result.error);
  const semanticResult = analyze(result.ast);

  assert.equal(semanticResult.success, false);
  assert.match(semanticResult.error, /Assignment expects int, but received string/);
  assert.match(semanticResult.error, /requires numeric operands/);
});

test('semantic analysis validates formatted output values', () => {
  const result = parseSource([
    'THIS IS WHERE THE FUN BEGINS',
    'JEDI count YOU ARE ON THIS COUNCIL 1;',
    'HELLO THERE ("%d %s", "not a number", count);',
    'HELLO THERE ("%d %s", count);',
    'ANOTHER HAPPY ENDING'
  ].join('\n'));

  assert.equal(result.success, true, result.error);
  const semanticResult = analyze(result.ast);

  assert.equal(semanticResult.success, false);
  assert.match(semanticResult.error, /Output format expects 2 values, but received 1/);
  assert.match(semanticResult.error, /Output format '%d' cannot display a value of type string/);
});

test('semantic analysis validates function return types and call arguments', () => {
  const result = parseSource([
    'KILL HIM JEDI identity(JEDI number)',
    'DO IT "not an integer";',
    'ANOTHER HAPPY ENDING',
    'THIS IS WHERE THE FUN BEGINS',
    'HELLO THERE (KILL HIM NOW identity("wrong argument"));',
    'ANOTHER HAPPY ENDING'
  ].join('\n'));

  assert.equal(result.success, true, result.error);
  const semanticResult = analyze(result.ast);

  assert.equal(semanticResult.success, false);
  assert.match(semanticResult.error, /Return value expects int, but received string/);
  assert.match(semanticResult.error, /Argument 1 of 'identity' expects int, but received string/);
});

test('semantic analysis requires non-void functions to return on every path', () => {
  const missingReturn = parseSource([
    'KILL HIM JEDI incomplete()',
    'JEDI value YOU ARE ON THIS COUNCIL 1;',
    'ANOTHER HAPPY ENDING'
  ].join('\n'));
  const completeReturn = parseSource([
    'KILL HIM JEDI complete(JEDI condition)',
    'YOU WERE THE CHOSEN ONE (condition)',
    'DO IT 1;',
    'YOU WERE SUPPOSED TO DESTROY THE SITH',
    'DO IT 0;',
    'ANOTHER HAPPY ENDING',
    'ANOTHER HAPPY ENDING'
  ].join('\n'));

  assert.equal(missingReturn.success, true, missingReturn.error);
  const missingReturnResult = analyze(missingReturn.ast);
  assert.equal(missingReturnResult.success, false);
  assert.match(missingReturnResult.error, /Function 'incomplete' must return a value of type int on every path/);
  assert.equal(completeReturn.success, true, completeReturn.error);
  assert.equal(analyze(completeReturn.ast).success, true);
});

test('semantic analysis rejects indexing a non-array and text conditions', () => {
  const result = parseSource([
    'THIS IS WHERE THE FUN BEGINS',
    'JEDI value YOU ARE ON THIS COUNCIL 1;',
    'HELLO THERE (value[0]);',
    'YOU WERE THE CHOSEN ONE ("truthy")',
    'HELLO THERE ("invalid condition");',
    'ANOTHER HAPPY ENDING',
    'ANOTHER HAPPY ENDING'
  ].join('\n'));

  assert.equal(result.success, true, result.error);
  const semanticResult = analyze(result.ast);

  assert.equal(semanticResult.success, false);
  assert.match(semanticResult.error, /Cannot index a value of type int/);
  assert.match(semanticResult.error, /Condition must be numeric or boolean, not string/);
});

test('WOOKIEE supports declared text values and string input', () => {
  const result = parseSource([
    'THIS IS WHERE THE FUN BEGINS',
    'WOOKIEE name YOU ARE ON THIS COUNCIL "Chewbacca";',
    'GENERAL KENOBI ("%d", &name);',
    'HELLO THERE ("%s", name);',
    'ANOTHER HAPPY ENDING'
  ].join('\n'));

  assert.equal(result.success, true, result.error);
  assert.equal(analyze(result.ast).success, true);

  const generated = generateCode(result.ast);
  assert.match(generated, /_read_values\(\[str\]\)/);
  const execution = spawnSync(process.env.PYTHON || 'python', ['-c', generated], {
    input: 'Han Solo\n',
    encoding: 'utf8',
    timeout: 5000
  });
  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout, 'Han');
});

test('parser and code generator support legacy data types and operators', () => {
  const result = parseSource([
    'THIS IS WHERE THE FUN BEGINS',
    'MASTER YODA letter;',
    'JEDI count YOU ARE ON THIS COUNCIL 1;',
    'YOUNGLING small;',
    'MASTER large;',
    'MASTER JEDI ratio;',
    'I HATE SAND decimal;',
    'HIGH GROUND JEDI unsignedCount;',
    'SITH nothing;',
    'count NOW THERE ARE TWO OF THEM;',
    'count WE ARE STILL FLYING HALF A SHIP;',
    'YOU WERE THE CHOSEN ONE (NOOOO (count YOU ARE A BOLD ONE 0) && count YOU ARE SHORTER THAN I EXPECTED 10)',
    'HELLO THERE? ("%d", count);',
    'ANOTHER HAPPY ENDING',
    'ANOTHER HAPPY ENDING'
  ].join('\n'));

  assert.equal(result.success, true, result.error);
  assert.equal(analyze(result.ast).success, true);

  const generated = generateCode(result.ast);
  assert.match(generated, /unsignedCount = None/);
  assert.match(generated, /count \+= 1/);
  assert.match(generated, /count -= 1/);
  assert.match(generated, /if \(\(not \(count == 0\)\) and \(count < 10\)\):/);
  assert.match(generated, /_printf\("%d", count\)/);
});

test('functions, scanf, printf, for loops, continue, and else-if generate valid Python', () => {
  const result = parseSource([
    'KILL HIM JEDI twice(JEDI value)',
    'DO IT value * 2;',
    'ANOTHER HAPPY ENDING',
    'THIS IS WHERE THE FUN BEGINS',
    'JEDI inputValue;',
    'GENERAL KENOBI?("%d", &inputValue);',
    'I WANT MORE (JEDI i YOU ARE ON THIS COUNCIL 0; i YOU ARE SHORTER THAN I EXPECTED 4; i NOW THERE ARE TWO OF THEM)',
    'YOU WERE THE CHOSEN ONE (i YOU ARE SHORTER THAN I EXPECTED 2)',
    'YOU UNDERESTIMATE MY POWER;',
    'PERHAPS THE ARCHIVES ARE INCOMPLETE (i YOU ARE A BOLD ONE 2)',
    'DONT TRY IT;',
    'YOU WERE SUPPOSED TO DESTROY THE SITH',
    'HELLO THERE ("%d ", KILL HIM NOW twice(inputValue + i));',
    'ANOTHER HAPPY ENDING',
    'ANOTHER HAPPY ENDING',
    'ANOTHER HAPPY ENDING'
  ].join('\n'));

  assert.equal(result.success, true, result.error);
  assert.equal(analyze(result.ast).success, true);

  const generated = generateCode(result.ast);
  assert.match(generated, /def twice\(value\):/);
  assert.match(generated, /return \(value \* 2\)/);
  assert.match(generated, /_read_values\(\[int\]\)/);
  assert.match(generated, /while \(i < 4\):/);
  assert.match(generated, /elif \(i == 2\):/);
  assert.match(generated, /i \+= 1\n\s+continue/);
  assert.match(generated, /twice\(\(inputValue \+ i\)\)/);
});

test('empty function and conditional blocks generate valid Python', () => {
  const result = parseSource([
    'KILL HIM SITH empty()',
    'ANOTHER HAPPY ENDING',
    'THIS IS WHERE THE FUN BEGINS',
    'KILL HIM NOW empty();',
    'YOU WERE THE CHOSEN ONE (0)',
    'ANOTHER HAPPY ENDING',
    'ANOTHER HAPPY ENDING'
  ].join('\n'));

  assert.equal(result.success, true, result.error);
  assert.equal(analyze(result.ast).success, true);

  const execution = spawnSync(process.env.PYTHON || 'python', [
    '-c',
    generateCode(result.ast)
  ], {
    encoding: 'utf8',
    timeout: 5000
  });

  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout, '');
});

test('postfix increment returns the original value and updates its variable', () => {
  const result = parseSource([
    'THIS IS WHERE THE FUN BEGINS',
    'JEDI value YOU ARE ON THIS COUNCIL 0;',
    'HELLO THERE ("%d%d", value NOW THERE ARE TWO OF THEM, value);',
    'ANOTHER HAPPY ENDING'
  ].join('\n'));

  assert.equal(result.success, true, result.error);
  assert.equal(analyze(result.ast).success, true);

  const execution = spawnSync(process.env.PYTHON || 'python', [
    '-c',
    generateCode(result.ast)
  ], {
    encoding: 'utf8',
    timeout: 5000
  });

  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout, '01');
});

test('input converters use the current function scope for same-named locals', () => {
  const result = parseSource([
    'KILL HIM MASTER YODA readChar()',
    'MASTER YODA value;',
    'GENERAL KENOBI (&value);',
    'DO IT value;',
    'ANOTHER HAPPY ENDING',
    'KILL HIM JEDI readInt()',
    'JEDI value;',
    'GENERAL KENOBI (&value);',
    'DO IT value;',
    'ANOTHER HAPPY ENDING',
    'THIS IS WHERE THE FUN BEGINS',
    'HELLO THERE ("%s %d", KILL HIM NOW readChar(), KILL HIM NOW readInt());',
    'ANOTHER HAPPY ENDING'
  ].join('\n'));

  assert.equal(result.success, true, result.error);
  assert.equal(analyze(result.ast).success, true);

  const generated = generateCode(result.ast);
  const conversions = generated.match(/_read_values\(\[(?:_char|int)\]\)/g);
  assert.deepEqual(conversions, ['_read_values([_char])', '_read_values([int])']);

  const execution = spawnSync(process.env.PYTHON || 'python', [
    '-c',
    generated
  ], {
    input: 'a\n42\n',
    encoding: 'utf8',
    timeout: 5000
  });

  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout, 'a 42');
});

test('for loops may omit their condition', () => {
  const result = parseSource([
    'THIS IS WHERE THE FUN BEGINS',
    'I WANT MORE (; ;) ',
    'DONT TRY IT;',
    'ANOTHER HAPPY ENDING',
    'ANOTHER HAPPY ENDING'
  ].join('\n'));

  assert.equal(result.success, true, result.error);
  assert.equal(analyze(result.ast).success, true);

  const execution = spawnSync(process.env.PYTHON || 'python', [
    '-c',
    generateCode(result.ast)
  ], {
    encoding: 'utf8',
    timeout: 5000
  });

  assert.equal(execution.status, 0, execution.stderr);
});

test('while, infinite loop, exit, and try-catch keywords are supported', () => {
  const result = parseSource([
    'THIS IS WHERE THE FUN BEGINS',
    'THIS IS GETTING OUT OF HAND (0)',
    'DONT TRY IT;',
    'ANOTHER HAPPY ENDING',
    'UNLIMITED POWAH',
    'EXECUTE ORDER 66;',
    'ANOTHER HAPPY ENDING',
    'IS IT POSSIBLE TO LEARN THIS POWER',
    'WHAT HAVE I DONE;',
    'NOT FROM A JEDI',
    'HELLO THERE ("caught");',
    'ANOTHER HAPPY ENDING',
    'ANOTHER HAPPY ENDING'
  ].join('\n'));

  assert.equal(result.success, true, result.error);
  assert.equal(analyze(result.ast).success, true);

  const generated = generateCode(result.ast);
  assert.match(generated, /while 0:/);
  assert.match(generated, /while True:/);
  assert.match(generated, /sys\.exit\(0\)/);
  assert.match(generated, /sys\.exit\(-1\)/);
  assert.match(generated, /except Exception:/);
});

test('break, continue, and return are rejected outside their valid contexts', () => {
  const result = parseSource([
    'DONT TRY IT;',
    'YOU UNDERESTIMATE MY POWER;',
    'DO IT 1;'
  ].join('\n'));

  assert.equal(result.success, true, result.error);
  const semanticResult = analyze(result.ast);
  assert.equal(semanticResult.success, false);
  assert.match(semanticResult.error, /can only be used inside a loop/);
  assert.match(semanticResult.error, /can only be used inside a function/);
});

test('Examples.txt compiles and runs all converted examples', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'Examples.txt'), 'utf8');
  const result = parseSource(source);

  assert.equal(result.success, true, result.error);
  const semanticResult = analyze(result.ast);
  assert.equal(semanticResult.success, true, semanticResult.error);

  const execution = spawnSync('python', ['-c', generateCode(result.ast)], {
    input: '20\n5\n',
    encoding: 'utf8',
    timeout: 5000
  });

  assert.equal(execution.error, undefined, execution.error && execution.error.message);
  assert.equal(execution.status, 0, execution.stderr);
  assert.match(execution.stdout, /Sorted array \(Bubble Sort\):\r?\n8 15 23 42 99/);
  assert.match(execution.stdout, /You are ready to face the trials!/);
  assert.match(execution.stdout, /Factorial of 5 is: 120/);
  assert.match(execution.stdout, /Element found at index 3!/);
  assert.match(execution.stdout, /Counting: 1 2 3 4 5/);
  assert.match(execution.stdout, /GCD of 48 and 18 is: 6/);
  assert.match(execution.stdout, /Fibonacci number 10 is: 55/);
});

test('Examples-Errors.txt demonstrates lexical, syntax, and semantic errors', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'Examples-Errors.txt'), 'utf8');
  const examples = source.split(/(?=^DID YOU EVER HEAR THE TRAGEDY OF DARTH PLAGUEIS THE WISE )/m)
    .map(example => example.trim())
    .filter(Boolean);

  assert.equal(examples.length, 3);

  for (const example of examples) {
    const [heading, ...lines] = example.split(/\r?\n/);
    const code = lines.join('\n');
    const lexResult = tokenize(code);

    if (heading.includes('Lexical error')) {
      assert.equal(lexResult.success, false, heading);
      assert.match(lexResult.error, /Unexpected character '@'/);
      continue;
    }

    assert.equal(lexResult.success, true, `${heading}: ${lexResult.error}`);
    const parseResult = parse(lexResult.tokens);

    if (heading.includes('Syntax error')) {
      assert.equal(parseResult.success, false, heading);
      assert.match(parseResult.error, /Expected ';' after statement/);
      continue;
    }

    assert.equal(parseResult.success, true, `${heading}: ${parseResult.error}`);
    const semanticResult = analyze(parseResult.ast);
    assert.equal(semanticResult.success, false, heading);
    assert.match(semanticResult.error, /Assignment expects int, but received string/);
  }
});

test('generated input waits for values instead of reading all stdin at startup', () => {
  const result = parseSource([
    'THIS IS WHERE THE FUN BEGINS',
    'JEDI value;',
    'HELLO THERE ("Value? ");',
    'GENERAL KENOBI ("%d", &value);',
    'HELLO THERE ("received=%d", value);',
    'ANOTHER HAPPY ENDING'
  ].join('\n'));

  assert.equal(result.success, true, result.error);
  const execution = spawnSync(process.env.PYTHON || 'python', [
    '-c',
    generateCode(result.ast)
  ], {
    input: '37\n',
    encoding: 'utf8',
    timeout: 5000
  });

  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout, 'Value? received=37');
});

test('input conversion honors MASTER YODA and MASTER JEDI types over scanf format', () => {
  const source = [
    'THIS IS WHERE THE FUN BEGINS',
    'MASTER YODA testchar;',
    'MASTER JEDI testdouble;',
    'GENERAL KENOBI ("%d %d", &testchar, &testdouble);',
    'HELLO THERE ("%s %.1f", testchar, testdouble);',
    'ANOTHER HAPPY ENDING'
  ].join('\n');
  const lexResult = tokenize(source);

  assert.equal(lexResult.success, true, lexResult.error);
  assert.deepEqual(
    lexResult.tokens.filter(token => token.value === 'MASTER YODA' || token.value === 'MASTER JEDI')
      .map(token => token.value),
    ['MASTER YODA', 'MASTER JEDI']
  );

  const result = parse(lexResult.tokens);
  assert.equal(result.success, true, result.error);
  assert.equal(analyze(result.ast).success, true);

  const generated = generateCode(result.ast);
  assert.match(generated, /_read_values\(\[_char, float\]\)/);

  const execution = spawnSync(process.env.PYTHON || 'python', [
    '-c',
    generated
  ], {
    input: 'a 2.5\n',
    encoding: 'utf8',
    timeout: 5000
  });

  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout, 'a 2.5');
});
