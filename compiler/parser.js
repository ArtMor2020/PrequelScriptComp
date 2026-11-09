// Parses lexer tokens into an abstract syntax tree and reports malformed
// statements with source locations.

const TYPE_KEYWORDS = new Set([
  'MASTER YODA',
  'JEDI',
  'YOUNGLING',
  'MASTER',
  'MASTER JEDI',
  'I HATE SAND',
  'HIGH GROUND',
  'SITH',
  'WOOKIEE'
]);

const BINARY_OPERATORS = new Map([
  ['YOU ARE ON THIS COUNCIL', { operator: '=', precedence: 1, rightAssociative: true }],
  ['=', { operator: '=', precedence: 1, rightAssociative: true }],
  ['||', { operator: '||', precedence: 2 }],
  ['&&', { operator: '&&', precedence: 3 }],
  ['==', { operator: '==', precedence: 4 }],
  ['>=', { operator: '>=', precedence: 5 }],
  ['<=', { operator: '<=', precedence: 5 }],
  ['//', { operator: '//', precedence: 7 }],
  ['YOU ARE A BOLD ONE', { operator: '==', precedence: 4 }],
  ['!=', { operator: '!=', precedence: 4 }],
  ['>', { operator: '>', precedence: 5 }],
  ['<', { operator: '<', precedence: 5 }],
  ['>=', { operator: '>=', precedence: 5 }],
  ['<=', { operator: '<=', precedence: 5 }],
  ['THERE IS ALWAYS A BIGGER FISH', { operator: '>', precedence: 5 }],
  ['YOU ARE SHORTER THAN I EXPECTED', { operator: '<', precedence: 5 }],
  ['+', { operator: '+', precedence: 6 }],
  ['-', { operator: '-', precedence: 6 }],
  ['*', { operator: '*', precedence: 7 }],
  ['/', { operator: '/', precedence: 7 }],
  ['%', { operator: '%', precedence: 7 }]
]);

const EXPRESSION_START_TYPES = new Set(['NUMBER', 'STRING', 'IDENTIFIER']);

function parse(tokens) {
  let current = 0;

  function peek(offset = 0) {
    return tokens[current + offset];
  }

  function previous() {
    return tokens[current - 1];
  }

  function isAtEnd() {
    return current >= tokens.length;
  }

  function advance() {
    if (!isAtEnd()) current++;
    return previous();
  }

  function match(value) {
    if (!isAtEnd() && peek().value === value) {
      advance();
      return true;
    }
    return false;
  }

  function expect(value, message) {
    if (!match(value)) {
      const token = peek() || previous();
      const line = token ? ` at line ${token.line}` : '';
      throw new Error(`Syntax Error: ${message}${line}`);
    }
  }

  function optionalQuestionMark() {
    match('?');
  }

  function parseType() {
    const token = peek();
    if (!token || !TYPE_KEYWORDS.has(token.value)) {
      const line = token ? ` at line ${token.line}` : '';
      throw new Error(`Syntax Error: Expected a data type${line}`);
    }

    advance();
    if (token.value === 'HIGH GROUND' && peek() && TYPE_KEYWORDS.has(peek().value) && peek().value !== 'HIGH GROUND') {
      return `HIGH GROUND ${advance().value}`;
    }
    return token.value;
  }

  function parsePrimary() {
    const token = advance();
    if (!token) {
      throw new Error('Syntax Error: Unexpected end of expression');
    }

    if (token.value === 'KILL HIM NOW') {
      const name = advance();
      if (!name || name.type !== 'IDENTIFIER') {
        throw new Error(`Syntax Error: Expected function name after KILL HIM NOW at line ${token.line}`);
      }
      expect('(', "Expected '(' after function name");
      const args = [];
      if (!match(')')) {
        do {
          args.push(parseExpression());
        } while (match(','));
        expect(')', "Expected ')' after function arguments");
      }
      return { type: 'CallExpression', name: name.value, arguments: args };
    }

    if (token.value === '(') {
      const expression = parseExpression();
      expect(')', "Expected ')' after expression");
      return expression;
    }

    if (token.value === '{') {
      const elements = [];
      if (!match('}')) {
        do {
          elements.push(parseExpression());
        } while (match(','));
        expect('}', "Expected '}' after array initializer");
      }
      return { type: 'ArrayLiteral', elements };
    }

    if (EXPRESSION_START_TYPES.has(token.type)) {
      let expression;
      if (token.type === 'IDENTIFIER' && match('(')) {
        const args = [];
        if (!match(')')) {
          do {
            args.push(parseExpression());
          } while (match(','));
          expect(')', "Expected ')' after function arguments");
        }
        expression = { type: 'CallExpression', name: token.value, arguments: args };
      } else {
        expression = {
          type: 'Literal',
          value: token.value,
          tokenType: token.type
        };
      }

      while (match('[')) {
        const index = parseExpression();
        expect(']', "Expected ']' after array index");
        expression = { type: 'IndexExpression', object: expression, index };
      }
      return expression;
    }

    if (token.type === 'KEYWORD') {
      throw new Error(`Syntax Error: Unsupported keyword '${token.value}' at line ${token.line}`);
    }
    throw new Error(`Syntax Error: Expected an expression at line ${token.line}`);
  }

  function parseUnary() {
    const token = peek();
    if (token && ['!', '-', '+', 'NOOOO', 'NOW THERE ARE TWO OF THEM', 'WE ARE STILL FLYING HALF A SHIP'].includes(token.value)) {
      advance();
      const operator = token.value === 'NOOOO' ? '!' :
        token.value === 'NOW THERE ARE TWO OF THEM' ? '++' :
          token.value === 'WE ARE STILL FLYING HALF A SHIP' ? '--' : token.value;
      return { type: 'UnaryExpression', operator, argument: parseUnary() };
    }

    let expression = parsePrimary();
    while (peek() && ['NOW THERE ARE TWO OF THEM', 'WE ARE STILL FLYING HALF A SHIP', '++', '--'].includes(peek().value)) {
      const operator = advance().value;
      expression = {
        type: 'UpdateExpression',
        operator: operator === 'NOW THERE ARE TWO OF THEM' || operator === '++' ? '++' : '--',
        argument: expression
      };
    }
    return expression;
  }

  function operatorAtCurrent() {
    const token = peek();
    if (!token) return null;

    // The lexer emits punctuation one symbol at a time; combine paired operators here.
    const combined = ['==', '!=', '>=', '<=', '&&', '||', '//'].find(value =>
      token.value === value || (token.value === value[0] && peek(1) && peek(1).value === value[1]));
    if (combined) return { value: combined, tokenCount: token.value === combined ? 1 : 2 };

    return BINARY_OPERATORS.has(token.value) ? { value: token.value, tokenCount: 1 } : null;
  }

  function parseExpression(minPrecedence = 1) {
    // Precedence climbing builds correctly grouped expressions without a rule per level.
    let left = parseUnary();

    while (true) {
      const currentOperator = operatorAtCurrent();
      if (!currentOperator) break;
      const operatorInfo = BINARY_OPERATORS.get(currentOperator.value);
      if (!operatorInfo || operatorInfo.precedence < minPrecedence) break;

      for (let index = 0; index < currentOperator.tokenCount; index++) advance();
      const nextPrecedence = operatorInfo.rightAssociative
        ? operatorInfo.precedence
        : operatorInfo.precedence + 1;
      const right = parseExpression(nextPrecedence);

      if (operatorInfo.operator === '=') {
        left = { type: 'AssignmentExpression', target: left, value: right };
      } else {
        left = {
          type: 'BinaryExpression',
          operator: operatorInfo.operator,
          left,
          right
        };
      }
    }

    return left;
  }

  function consumeStatementTerminator() {
    expect(';', "Expected ';' after statement");
  }

  function parseVariableDeclaration(consumeTerminator = true) {
    const dataType = parseType();
    const token = advance();
    if (!token || token.type !== 'IDENTIFIER') {
      const line = token ? token.line : previous().line;
      throw new Error(`Syntax Error: Expected variable name after type at line ${line}`);
    }

    let arraySize = null;
    if (match('[')) {
      if (!match(']')) {
        arraySize = parseExpression();
        expect(']', "Expected ']' after array size");
      }
    }

    let initializer = null;
    if (match('YOU ARE ON THIS COUNCIL') || match('=')) {
      initializer = parseExpression();
    }

    if (consumeTerminator) consumeStatementTerminator();
    return { type: 'VariableDeclaration', dataType, name: token.value, arraySize, initializer };
  }

  function parseBodyUntil(endValues) {
    const body = [];
    while (!isAtEnd() && !endValues.includes(peek().value)) {
      const start = current;
      body.push(parseStatement());
      if (current === start) {
        throw new Error(`Syntax Error: Unable to parse statement at line ${peek().line}`);
      }
    }
    return body;
  }

  function parseCondition(keyword) {
    optionalQuestionMark();
    expect('(', `Expected '(' after ${keyword}`);
    const condition = parseExpression();
    expect(')', "Expected ')' after condition");
    return condition;
  }

  function parseIfStatement() {
    const token = advance();
    const condition = parseCondition(token.value);
    const consequent = parseBodyUntil([
      'YOU WERE SUPPOSED TO DESTROY THE SITH',
      'PERHAPS THE ARCHIVES ARE INCOMPLETE',
      'ANOTHER HAPPY ENDING'
    ]);

    const elseIfs = [];
    while (match('PERHAPS THE ARCHIVES ARE INCOMPLETE')) {
      const elseIfCondition = parseCondition('PERHAPS THE ARCHIVES ARE INCOMPLETE');
      const body = parseBodyUntil([
        'YOU WERE SUPPOSED TO DESTROY THE SITH',
        'PERHAPS THE ARCHIVES ARE INCOMPLETE',
        'ANOTHER HAPPY ENDING'
      ]);
      elseIfs.push({ condition: elseIfCondition, body });
    }

    let alternate = [];
    if (match('YOU WERE SUPPOSED TO DESTROY THE SITH')) {
      alternate = parseBodyUntil(['ANOTHER HAPPY ENDING']);
    }
    expect('ANOTHER HAPPY ENDING', "Expected 'ANOTHER HAPPY ENDING' to close conditional block");
    return { type: 'IfStatement', condition, consequent, elseIfs, alternate };
  }

  function parseWhileStatement(infinite = false) {
    const token = advance();
    const condition = infinite ? null : parseCondition(token.value);
    const body = parseBodyUntil(['ANOTHER HAPPY ENDING']);
    expect('ANOTHER HAPPY ENDING', `Expected 'ANOTHER HAPPY ENDING' to close ${infinite ? 'loop' : 'while loop'}`);
    return { type: infinite ? 'InfiniteLoopStatement' : 'WhileStatement', condition, body };
  }

  function parseForStatement() {
    const token = advance();
    optionalQuestionMark();
    expect('(', "Expected '(' after I WANT MORE");

    let initializer = null;
    if (!match(';')) {
      initializer = peek() && TYPE_KEYWORDS.has(peek().value)
        ? parseVariableDeclaration(false)
        : { type: 'ExpressionStatement', expression: parseExpression() };
      expect(';', "Expected ';' after for-loop initializer");
    }

    let condition = null;
    if (!match(';')) {
      condition = parseExpression();
      expect(';', "Expected ';' after for-loop condition");
    }

    let update = null;
    if (!match(')')) {
      update = parseExpression();
      expect(')', "Expected ')' after for-loop update");
    }

    const body = parseBodyUntil(['ANOTHER HAPPY ENDING']);
    expect('ANOTHER HAPPY ENDING', "Expected 'ANOTHER HAPPY ENDING' to close for loop");
    return { type: 'ForStatement', initializer, condition, update, body, line: token.line };
  }

  function parseFunctionDeclaration() {
    const token = advance();
    const wrapped = match('(');
    const returnType = parseType();
    const name = advance();
    if (!name || name.type !== 'IDENTIFIER') {
      throw new Error(`Syntax Error: Expected function name after return type at line ${token.line}`);
    }

    expect('(', "Expected '(' before function parameters");
    const parameters = [];
    if (!match(')')) {
      do {
        const dataType = parseType();
        const parameter = advance();
        if (!parameter || parameter.type !== 'IDENTIFIER') {
          throw new Error(`Syntax Error: Expected parameter name at line ${token.line}`);
        }
        const isArray = match('[');
        if (isArray) expect(']', "Expected ']' after array parameter");
        parameters.push({ dataType, name: parameter.value, isArray });
      } while (match(','));
      expect(')', "Expected ')' after function parameters");
    }
    if (wrapped) expect(')', "Expected ')' after wrapped function signature");

    const body = parseBodyUntil(['ANOTHER HAPPY ENDING']);
    expect('ANOTHER HAPPY ENDING', "Expected 'ANOTHER HAPPY ENDING' to close function");
    return { type: 'FunctionDeclaration', returnType, name: name.value, parameters, body };
  }

  function parseInputStatement() {
    const token = advance();
    optionalQuestionMark();
    const variables = [];
    let format = null;

    if (match('(')) {
      if (peek() && peek().type === 'STRING') {
        format = advance().value;
        if (!match(')')) {
          expect(',', "Expected ',' after scanf format string");
          do {
            match('&');
            const variable = advance();
            if (!variable || variable.type !== 'IDENTIFIER') {
              throw new Error(`Syntax Error: Expected input variable at line ${token.line}`);
            }
            variables.push(variable.value);
          } while (match(','));
          expect(')', "Expected ')' after input variables");
        }
      } else if (!match(')')) {
        do {
          match('&');
          const variable = advance();
          if (!variable || variable.type !== 'IDENTIFIER') {
            throw new Error(`Syntax Error: Expected input variable at line ${token.line}`);
          }
          variables.push(variable.value);
        } while (match(','));
        expect(')', "Expected ')' after input variables");
      }
    } else {
      match('&');
      const variable = advance();
      if (!variable || variable.type !== 'IDENTIFIER') {
        throw new Error(`Syntax Error: Expected variable name after GENERAL KENOBI at line ${token.line}`);
      }
      variables.push(variable.value);
    }

    consumeStatementTerminator();
    return { type: 'InputStatement', variables, format };
  }

  function parsePrintStatement() {
    const token = advance();
    optionalQuestionMark();
    const args = [];
    if (match('(')) {
      if (!match(')')) {
        do {
          args.push(parseExpression());
        } while (match(','));
        expect(')', "Expected ')' after HELLO THERE arguments");
      }
    } else if (!isAtEnd() && peek().value !== ';') {
      args.push(parseExpression());
    }
    consumeStatementTerminator();
    return { type: 'PrintStatement', arguments: args };
  }

  function parseTryStatement() {
    const token = advance();
    const body = parseBodyUntil(['NOT FROM A JEDI', 'ANOTHER HAPPY ENDING']);
    expect('NOT FROM A JEDI', "Expected 'NOT FROM A JEDI' after try block");
    const handler = parseBodyUntil(['ANOTHER HAPPY ENDING']);
    expect('ANOTHER HAPPY ENDING', `Expected 'ANOTHER HAPPY ENDING' to close try block at line ${token.line}`);
    return { type: 'TryStatement', body, handler };
  }

  function startsExpression(token) {
    return !!token && (
      EXPRESSION_START_TYPES.has(token.type) ||
      ['(', '!', '-', '+', 'NOOOO', 'KILL HIM NOW'].includes(token.value)
    );
  }

  function parseStatement() {
    const token = peek();
    if (!token) throw new Error('Syntax Error: Unexpected end of input');

    if (token.value === 'THIS IS WHERE THE FUN BEGINS') {
      advance();
      const body = parseBodyUntil(['ANOTHER HAPPY ENDING']);
      expect('ANOTHER HAPPY ENDING', `Expected 'ANOTHER HAPPY ENDING' to close program at line ${token.line}`);
      return { type: 'Program', body };
    }
    if (TYPE_KEYWORDS.has(token.value)) return parseVariableDeclaration();
    if (token.value === 'HELLO THERE') return parsePrintStatement();
    if (token.value === 'GENERAL KENOBI') return parseInputStatement();
    if (token.value === 'YOU WERE THE CHOSEN ONE') return parseIfStatement();
    if (token.value === 'THIS IS GETTING OUT OF HAND') return parseWhileStatement();
    if (token.value === 'I WANT MORE') return parseForStatement();
    if (token.value === 'UNLIMITED POWAH') return parseWhileStatement(true);
    if (token.value === 'KILL HIM') return parseFunctionDeclaration();

    if (token.value === 'KILL HIM NOW') {
      advance();
      const call = parseExpression();
      if (call.type !== 'CallExpression') {
        throw new Error(`Syntax Error: Expected function call after KILL HIM NOW at line ${token.line}`);
      }
      consumeStatementTerminator();
      return { type: 'ExpressionStatement', expression: call };
    }

    if (token.value === 'DO IT') {
      advance();
      const value = startsExpression(peek()) ? parseExpression() : null;
      consumeStatementTerminator();
      return { type: 'ReturnStatement', value };
    }

    if (token.value === 'DONT TRY IT' || token.value === 'YOU UNDERESTIMATE MY POWER') {
      advance();
      consumeStatementTerminator();
      return { type: token.value === 'DONT TRY IT' ? 'BreakStatement' : 'ContinueStatement' };
    }

    if (token.value === 'EXECUTE ORDER 66' || token.value === 'WHAT HAVE I DONE') {
      advance();
      consumeStatementTerminator();
      return { type: 'ExitStatement', status: token.value === 'EXECUTE ORDER 66' ? 0 : -1 };
    }

    if (token.value === 'IS IT POSSIBLE TO LEARN THIS POWER') return parseTryStatement();

    const expression = parseExpression();
    consumeStatementTerminator();
    return { type: 'ExpressionStatement', expression };
  }

  try {
    const body = [];
    while (!isAtEnd()) {
      body.push(parseStatement());
    }
    return { success: true, ast: { type: 'File', body } };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { parse };
