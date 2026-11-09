// Translates the semantic-checked AST into executable Python, including
// compatibility helpers for PrequelScript's C-inspired input and output.

function generateCode(ast) {
  let indentLevel = 0;

  function indent() {
    return '    '.repeat(indentLevel);
  }

  function renderBody(statements, context) {
    if (!statements || statements.length === 0) {
      indentLevel++;
      const code = `${indent()}pass\n`;
      indentLevel--;
      return code;
    }
    let code = '';
    indentLevel++;
    for (const statement of statements) {
      code += indent() + visit(statement, context) + '\n';
    }
    indentLevel--;
    return code;
  }

  function expression(node, statementPosition = false) {
    if (!node) return '';

    switch (node.type) {
      case 'Literal':
        return node.value;

      case 'ArrayLiteral':
        return `[${node.elements.map(element => expression(element)).join(', ')}]`;

      case 'IndexExpression':
        return `${expression(node.object)}[${expression(node.index)}]`;

      case 'BinaryExpression': {
        const operators = { '&&': 'and', '||': 'or' };
        return `(${expression(node.left)} ${operators[node.operator] || node.operator} ${expression(node.right)})`;
      }

      case 'AssignmentExpression': {
        const target = expression(node.target);
        const value = expression(node.value);
        return statementPosition ? `${target} = ${value}` : `(${target} := ${value})`;
      }

      case 'UnaryExpression': {
        if (node.operator === '++' || node.operator === '--') {
          const target = expression(node.argument);
          const delta = node.operator === '++' ? '+' : '-';
          return statementPosition
            ? `${target} ${delta}= 1`
            : `(${target} := ${target} ${delta} 1)`;
        }
        const operator = node.operator === '!' ? 'not ' : node.operator;
        return `(${operator}${expression(node.argument)})`;
      }

      case 'UpdateExpression': {
        const target = expression(node.argument);
        const delta = node.operator === '++' ? '+' : '-';
        return statementPosition
          ? `${target} ${delta}= 1`
          : `(${target} := ${target} ${delta} 1) ${delta === '+' ? '-' : '+'} 1`;
      }

      case 'CallExpression':
        return `${node.name}(${node.arguments.map(argument => expression(argument)).join(', ')})`;

      default:
        return '';
    }
  }

  function inputConverters(node, declaredTypes) {
    const format = node.format && node.format.slice(1, -1);
    const formatTypes = format
      ? [...format.matchAll(/%[-+0 #]*\d*(?:\.\d+)?(?:hh|h|ll|l|L|z|j|t)?([diuoxXfFeEgGcs%])/g)]
        .map(match => match[1])
        .filter(type => type !== '%')
      : [];

    return node.variables.map((variable, index) => {
      const formatType = formatTypes[index];
      const dataType = declaredTypes.get(variable) || '';
      if (dataType === 'MASTER YODA') return '_char';
      if (dataType === 'MASTER JEDI' || dataType === 'I HATE SAND') return 'float';
      if (dataType === 'SITH' || dataType === 'WOOKIEE') return 'str';
      if (formatType === 'd' || formatType === 'i' || formatType === 'u' ||
          formatType === 'o' || formatType === 'x' || formatType === 'X') return 'int';
      if (formatType && 'fFeEgG'.includes(formatType)) return 'float';
      if (formatType === 'c') return '_char';
      if (formatType === 's') return 'str';

      return 'int';
    });
  }

  function visit(node, context = { forUpdate: null, declaredTypes: new Map() }) {
    if (!node) return '';

    switch (node.type) {
      case 'File': {
        const functions = node.body.filter(child => child.type === 'FunctionDeclaration');
        const statements = node.body.filter(child => child.type !== 'FunctionDeclaration');
        let code = [
          'import re',
          'import sys',
          '_input_values = []',
          '',
          'def _next_input_value():',
          '    while not _input_values:',
          '        line = sys.stdin.readline()',
          '        if line == "":',
          '            raise EOFError("No more input available")',
          '        _input_values.extend(line.split())',
          '    return _input_values.pop(0)',
          '',
          'def _read_values(converters):',
          '    values = []',
          '    for converter in converters:',
          '        values.append(converter(_next_input_value()))',
          '    return values',
          '',
          'def _char(value):',
          '    return value[0] if value else ""',
          '',
          'def _printf(format_string, *args):',
          '    format_string = re.sub(r"%(?P<flags>[-+0 #]*\\d*(?:\\.\\d+)?)(?:hh|h|ll|l|L|z|j|t)(?P<type>[diuoxXfFeEgGcs])", r"%\\g<flags>\\g<type>", format_string)',
          '    has_format = re.search(r"%(?!%)[-+0 #]*\\d*(?:\\.\\d+)?[diuoxXfFeEgGcs]", format_string)',
          '    output = format_string % args if has_format and args else format_string.replace("%%", "%")',
          '    sys.stdout.write(output)',
          ''
        ].join('\n');

        for (const fn of functions) code += `${visit(fn)}\n`;
        for (const statement of statements) code += `${visit(statement)}\n`;
        return code.trimEnd();
      }

      case 'Program': {
        let code = 'def main():\n';
        const programContext = {
          ...context,
          declaredTypes: new Map()
        };
        indentLevel++;
        const statements = node.body.filter(child => child.type !== 'FunctionDeclaration');
        if (statements.length === 0) {
          code += `${indent()}pass\n`;
        } else {
          for (const child of statements) code += `${indent()}${visit(child, programContext)}\n`;
        }
        indentLevel--;
        code += '\nif __name__ == "__main__":\n    main()';
        return code;
      }

      case 'FunctionDeclaration': {
        const parameters = node.parameters.map(parameter => parameter.name).join(', ');
        const functionTypes = new Map(node.parameters.map(parameter => [
          parameter.name,
          parameter.dataType
        ]));
        let code = `def ${node.name}(${parameters}):\n`;
        code += renderBody(node.body, { forUpdate: null, declaredTypes: functionTypes });
        return code.trimEnd();
      }

      case 'VariableDeclaration': {
        context.declaredTypes.set(node.name, node.dataType);
        let initializer;
        if (node.initializer) {
          initializer = expression(node.initializer);
        } else if (node.arraySize) {
          initializer = `[None] * ${expression(node.arraySize)}`;
        } else {
          initializer = 'None';
        }
        return `${node.name} = ${initializer}`;
      }

      case 'PrintStatement': {
        const args = node.arguments || [];
        if (args.length > 0 && args[0].tokenType === 'STRING') {
          return `_printf(${args.map(argument => expression(argument)).join(', ')})`;
        }
        return `print(${args.map(argument => expression(argument)).join(', ')})`;
      }

      case 'InputStatement': {
        const converters = inputConverters(node, context.declaredTypes);
        if (node.variables.length === 0) return '_read_values([])';
        const values = `_read_values([${converters.join(', ')}])`;
        return node.variables.length === 1
          ? `${node.variables[0]} = ${values}[0]`
          : `${node.variables.join(', ')} = ${values}`;
      }

      case 'IfStatement': {
        let code = `if ${expression(node.condition)}:\n`;
        code += renderBody(node.consequent, {
          ...context,
          declaredTypes: new Map(context.declaredTypes)
        });
        for (const branch of node.elseIfs) {
          code += `${indent()}elif ${expression(branch.condition)}:\n`;
          code += renderBody(branch.body, {
            ...context,
            declaredTypes: new Map(context.declaredTypes)
          });
        }
        if (node.alternate.length > 0) {
          code += `${indent()}else:\n`;
          code += renderBody(node.alternate, {
            ...context,
            declaredTypes: new Map(context.declaredTypes)
          });
        }
        return code.trimEnd();
      }

      case 'WhileStatement': {
        let code = `while ${expression(node.condition)}:\n`;
        code += renderBody(node.body, {
          forUpdate: null,
          declaredTypes: new Map(context.declaredTypes)
        });
        return code.trimEnd();
      }

      case 'InfiniteLoopStatement': {
        let code = 'while True:\n';
        code += renderBody(node.body, {
          forUpdate: null,
          declaredTypes: new Map(context.declaredTypes)
        });
        return code.trimEnd();
      }

      case 'ForStatement': {
        const loopContext = {
          ...context,
          declaredTypes: new Map(context.declaredTypes)
        };
        let code = '';
        if (node.initializer) {
          const initial = node.initializer.type === 'VariableDeclaration'
            ? visit(node.initializer, loopContext)
            : expression(node.initializer.expression, true);
          code += `${initial}\n${indent()}`;
        }
        code += `while ${node.condition ? expression(node.condition) : 'True'}:\n`;
        const update = node.update ? expression(node.update, true) : null;
        code += renderBody(node.body, { ...loopContext, forUpdate: update });
        if (update) code += `${indent()}    ${update}\n`;
        return code.trimEnd();
      }

      case 'TryStatement': {
        let code = 'try:\n';
        code += renderBody(node.body, {
          ...context,
          declaredTypes: new Map(context.declaredTypes)
        });
        code += `${indent()}except Exception:\n`;
        code += renderBody(node.handler, {
          ...context,
          declaredTypes: new Map(context.declaredTypes)
        });
        return code.trimEnd();
      }

      case 'ReturnStatement':
        return node.value ? `return ${expression(node.value)}` : 'return';

      case 'BreakStatement':
        return 'break';

      case 'ContinueStatement':
        // A C-style for-loop still executes its update expression on continue.
        return context.forUpdate
          ? `${context.forUpdate}\n${indent()}continue`
          : 'continue';

      case 'ExitStatement':
        return `sys.exit(${node.status})`;

      case 'ExpressionStatement':
        return expression(node.expression, true);

      default:
        return '';
    }
  }

  return visit(ast);
}

module.exports = { generateCode };
