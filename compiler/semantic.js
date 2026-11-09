// Performs semantic checks on the parsed AST, including type compatibility,
// declarations, scope, function usage, and control-flow context.

function normalizeType(type) {
  if (!type) return 'unknown';
  if (type.endsWith('[]')) return `${normalizeType(type.slice(0, -2))}[]`;

  switch (type) {
    case 'JEDI':
    case 'YOUNGLING':
    case 'MASTER':
    case 'HIGH GROUND':
    case 'HIGH GROUND JEDI':
      return 'int';
    case 'MASTER YODA':
      return 'char';
    case 'MASTER JEDI':
    case 'I HATE SAND':
      return 'float';
    case 'SITH':
      return 'void';
    case 'WOOKIEE':
      return 'string';
    default:
      return type;
  }
}

function isNumeric(type) {
  return type === 'int' || type === 'float';
}

function isCompatible(expected, actual) {
  if (expected === 'unknown' || actual === 'unknown') return true;
  if (expected === actual) return true;
  if (isNumeric(expected) && isNumeric(actual)) return true;
  return false;
}

function analyze(ast) {
  const symbolTable = new Map();
  const functions = new Map();
  const errors = [];

  // Collect declarations first so calls can refer to functions declared later.
  function collectFunctions(node, fileScope = false) {
    if (!node) return;
    if (node.type === 'FunctionDeclaration') {
      if (!fileScope) {
        errors.push(`Semantic Error: Function '${node.name}' must be declared at file scope.`);
      }
      if (functions.has(node.name)) {
        errors.push(`Semantic Error: Function '${node.name}' has already been declared.`);
      } else {
        functions.set(node.name, node);
      }
      node.body.forEach(child => collectFunctions(child));
      return;
    }
    if (node.body) node.body.forEach(child => collectFunctions(child));
  }

  function reportTypeMismatch(expected, actual, subject) {
    if (!isCompatible(expected, actual)) {
      errors.push(`Semantic Error: ${subject} expects ${expected}, but received ${actual}.`);
    }
  }

  function alwaysReturns(statements) {
    for (const statement of statements) {
      if (statement.type === 'ReturnStatement') return true;
      if (statement.type === 'IfStatement' &&
          statement.alternate.length > 0 &&
          alwaysReturns(statement.consequent) &&
          statement.elseIfs.every(branch => alwaysReturns(branch.body)) &&
          alwaysReturns(statement.alternate)) {
        return true;
      }
      if (statement.type === 'TryStatement' &&
          alwaysReturns(statement.body) &&
          alwaysReturns(statement.handler)) {
        return true;
      }
    }
    return false;
  }

  function inferExpression(node, scope) {
    if (!node) return 'void';

    switch (node.type) {
      case 'Literal':
        if (node.tokenType === 'NUMBER') return node.value.includes('.') ? 'float' : 'int';
        if (node.tokenType === 'STRING') {
          const contents = node.value.slice(1, -1);
          return /^(?:[^\\]|\\.)$/.test(contents) ? 'char' : 'string';
        }
        if (node.tokenType === 'IDENTIFIER') {
          if (!scope.has(node.value)) {
            errors.push(`Semantic Error: Use of undeclared variable '${node.value}'.`);
            // Keep checking the surrounding expression without cascading type errors.
            return 'unknown';
          }
          return scope.get(node.value);
        }
        return 'unknown';

      case 'ArrayLiteral': {
        if (node.elements.length === 0) return 'unknown[]';
        const elementTypes = node.elements.map(element => inferExpression(element, scope));
        const elementType = elementTypes[0];
        for (const actual of elementTypes.slice(1)) {
          reportTypeMismatch(elementType, actual, 'Array element');
        }
        return `${elementType}[]`;
      }

      case 'IndexExpression': {
        const objectType = inferExpression(node.object, scope);
        const indexType = inferExpression(node.index, scope);
        if (indexType !== 'int' && indexType !== 'unknown') {
          errors.push(`Semantic Error: Array index must be an integer, not ${indexType}.`);
        }
        if (!objectType.endsWith('[]') && objectType !== 'unknown') {
          errors.push(`Semantic Error: Cannot index a value of type ${objectType}.`);
          return 'unknown';
        }
        return objectType.endsWith('[]') ? objectType.slice(0, -2) : 'unknown';
      }

      case 'BinaryExpression': {
        const left = inferExpression(node.left, scope);
        const right = inferExpression(node.right, scope);
        const operator = node.operator;

        if (['+', '-', '*', '/', '//', '%'].includes(operator)) {
          if (operator === '+' && ['string', 'char'].includes(left) && ['string', 'char'].includes(right)) {
            return left === 'string' || right === 'string' ? 'string' : 'char';
          }
          if (!isNumeric(left) && left !== 'unknown' || !isNumeric(right) && right !== 'unknown') {
            errors.push(`Semantic Error: Operator '${operator}' requires numeric operands, not ${left} and ${right}.`);
            return 'unknown';
          }
          if (operator === '/') return 'float';
          if (operator === '//' || operator === '%') return 'int';
          return left === 'float' || right === 'float' ? 'float' : 'int';
        }

        if (['<', '>', '<=', '>='].includes(operator)) {
          if (!(isNumeric(left) && isNumeric(right)) &&
              !(['string', 'char'].includes(left) && ['string', 'char'].includes(right)) &&
              left !== 'unknown' && right !== 'unknown') {
            errors.push(`Semantic Error: Operator '${operator}' cannot compare ${left} with ${right}.`);
          }
          return 'bool';
        }

        if (['==', '!='].includes(operator)) {
          if (!isCompatible(left, right) && left !== 'unknown' && right !== 'unknown') {
            errors.push(`Semantic Error: Cannot compare ${left} with ${right}.`);
          }
          return 'bool';
        }

        if (['&&', '||'].includes(operator)) {
          const validLeft = isNumeric(left) || left === 'bool' || left === 'unknown';
          const validRight = isNumeric(right) || right === 'bool' || right === 'unknown';
          if (!validLeft || !validRight) {
            errors.push(`Semantic Error: Operator '${operator}' requires numeric or boolean operands.`);
          }
          return 'bool';
        }

        return 'unknown';
      }

      case 'AssignmentExpression': {
        let targetType = 'unknown';
        if (node.target.type === 'IndexExpression') {
          targetType = inferExpression(node.target, scope);
        } else if (node.target.type === 'Literal' && node.target.tokenType === 'IDENTIFIER') {
          if (!scope.has(node.target.value)) {
            errors.push(`Semantic Error: Use of undeclared variable '${node.target.value}'.`);
          } else {
            targetType = scope.get(node.target.value);
          }
        } else {
          errors.push('Semantic Error: Assignment target must be a variable or array element.');
        }
        const valueType = inferExpression(node.value, scope);
        reportTypeMismatch(targetType.replace(/\[\]$/, ''), valueType, 'Assignment');
        return targetType;
      }

      case 'UnaryExpression':
      case 'UpdateExpression': {
        const argumentType = inferExpression(node.argument, scope);
        if (node.operator === '++' || node.operator === '--' || node.operator === '+' || node.operator === '-') {
          if (!isNumeric(argumentType) && argumentType !== 'unknown') {
            errors.push(`Semantic Error: Operator '${node.operator}' requires a numeric operand, not ${argumentType}.`);
          }
          if (node.operator === '++' || node.operator === '--') {
            if (node.argument.type !== 'Literal' || node.argument.tokenType !== 'IDENTIFIER') {
              errors.push('Semantic Error: Increment and decrement require a variable.');
            }
          }
          return argumentType;
        }
        if (node.operator === '!') {
          if (!isNumeric(argumentType) && argumentType !== 'bool' && argumentType !== 'unknown') {
            errors.push(`Semantic Error: Logical negation cannot be applied to ${argumentType}.`);
          }
          return 'bool';
        }
        return 'unknown';
      }

      case 'CallExpression': {
        const fn = functions.get(node.name);
        if (!fn) {
          errors.push(`Semantic Error: Call to undeclared function '${node.name}'.`);
          node.arguments.forEach(argument => inferExpression(argument, scope));
          return 'unknown';
        }
        if (node.arguments.length !== fn.parameters.length) {
          errors.push(`Semantic Error: Function '${node.name}' expects ${fn.parameters.length} arguments, but received ${node.arguments.length}.`);
        }
        node.arguments.forEach((argument, index) => {
          const actual = inferExpression(argument, scope);
          const parameter = fn.parameters[index];
          if (parameter) {
            const expected = normalizeType(`${parameter.dataType}${parameter.isArray ? '[]' : ''}`);
            reportTypeMismatch(expected, actual, `Argument ${index + 1} of '${node.name}'`);
          }
        });
        return normalizeType(fn.returnType);
      }

      default:
        return 'unknown';
    }
  }

  function visit(node, scope = symbolTable, context = { loopDepth: 0, inFunction: false, returnType: 'void' }) {
    if (!node) return;

    switch (node.type) {
      case 'File':
        node.body.forEach(child => {
          if (child.type === 'Program') {
            // Each program has its own top-level variable scope.
            visit(child, new Map(scope), context);
          } else {
            visit(child, scope, context);
          }
        });
        break;

      case 'Program':
        node.body.forEach(child => visit(child, scope, context));
        break;

      case 'VariableDeclaration': {
        const declaredType = normalizeType(`${node.dataType}${node.arraySize !== null ? '[]' : ''}`);
        if (scope.has(node.name)) {
          errors.push(`Semantic Error: Variable '${node.name}' has already been declared.`);
        } else {
          scope.set(node.name, declaredType);
        }
        if (node.arraySize) {
          const sizeType = inferExpression(node.arraySize, scope);
          if (sizeType !== 'int' && sizeType !== 'unknown') {
            errors.push(`Semantic Error: Array size must be an integer, not ${sizeType}.`);
          }
        }
        if (node.initializer) {
          const initializerType = inferExpression(node.initializer, scope);
          reportTypeMismatch(declaredType, initializerType, `Initializer for '${node.name}'`);
        }
        break;
      }

      case 'FunctionDeclaration': {
        const functionScope = new Map();
        for (const parameter of node.parameters) {
          if (functionScope.has(parameter.name)) {
            errors.push(`Semantic Error: Parameter '${parameter.name}' is declared more than once.`);
          } else {
            functionScope.set(parameter.name, normalizeType(`${parameter.dataType}${parameter.isArray ? '[]' : ''}`));
          }
        }
        const functionContext = {
          loopDepth: 0,
          inFunction: true,
          returnType: normalizeType(node.returnType)
        };
        node.body.forEach(child => visit(child, functionScope, functionContext));
        if (functionContext.returnType !== 'void' && !alwaysReturns(node.body)) {
          errors.push(`Semantic Error: Function '${node.name}' must return a value of type ${functionContext.returnType} on every path.`);
        }
        break;
      }

      case 'PrintStatement':
        {
          const argumentTypes = node.arguments.map(argument => inferExpression(argument, scope));
          const format = node.arguments[0];
          if (format && format.type === 'Literal' && format.tokenType === 'STRING') {
            // Validate supported printf-style specifiers against their value arguments.
            const specifiers = [...format.value.slice(1, -1).matchAll(
              /%[-+0 #]*\d*(?:\.\d+)?(?:hh|h|ll|l|L|z|j|t)?([diuoxXfFeEgGcs%])/g
            )].map(match => match[1]).filter(type => type !== '%');

            if (specifiers.length > 0 && specifiers.length !== argumentTypes.length - 1) {
              errors.push(`Semantic Error: Output format expects ${specifiers.length} values, but received ${argumentTypes.length - 1}.`);
            }

            specifiers.forEach((specifier, index) => {
              const actual = argumentTypes[index + 1];
              if (!actual) return;
              let valid = true;
              if ('diu'.includes(specifier)) valid = isNumeric(actual) || actual === 'unknown';
              else if ('oxX'.includes(specifier)) valid = actual === 'int' || actual === 'unknown';
              else if ('fFeEgG'.includes(specifier)) valid = isNumeric(actual) || actual === 'unknown';
              else if (specifier === 'c') valid = actual === 'char' || actual === 'int' || actual === 'unknown';
              else if (specifier === 's') valid = !actual.endsWith('[]') && actual !== 'void';
              if (!valid) {
                errors.push(`Semantic Error: Output format '%${specifier}' cannot display a value of type ${actual}.`);
              }
            });
          }
        }
        break;

      case 'InputStatement':
        node.variables.forEach(variable => {
          if (!scope.has(variable)) {
            errors.push(`Semantic Error: Use of undeclared variable '${variable}'.`);
          }
        });
        break;

      case 'IfStatement': {
        const conditionType = inferExpression(node.condition, scope);
        if (!['int', 'float', 'bool', 'unknown'].includes(conditionType)) {
          errors.push(`Semantic Error: Condition must be numeric or boolean, not ${conditionType}.`);
        }
        // Branch-local declarations must not leak into sibling branches or afterward.
        const consequentScope = new Map(scope);
        node.consequent.forEach(child => visit(child, consequentScope, context));
        for (const branch of node.elseIfs) {
          const branchConditionType = inferExpression(branch.condition, scope);
          if (!['int', 'float', 'bool', 'unknown'].includes(branchConditionType)) {
            errors.push(`Semantic Error: Condition must be numeric or boolean, not ${branchConditionType}.`);
          }
          const branchScope = new Map(scope);
          branch.body.forEach(child => visit(child, branchScope, context));
        }
        const alternateScope = new Map(scope);
        node.alternate.forEach(child => visit(child, alternateScope, context));
        break;
      }

      case 'WhileStatement': {
        const conditionType = inferExpression(node.condition, scope);
        if (!['int', 'float', 'bool', 'unknown'].includes(conditionType)) {
          errors.push(`Semantic Error: Loop condition must be numeric or boolean, not ${conditionType}.`);
        }
        // Loop-local declarations are visible within the loop, but not after it.
        const loopScope = new Map(scope);
        node.body.forEach(child => visit(child, loopScope, {
          ...context,
          loopDepth: context.loopDepth + 1
        }));
        break;
      }

      case 'InfiniteLoopStatement': {
        const loopScope = new Map(scope);
        node.body.forEach(child => visit(child, loopScope, {
          ...context,
          loopDepth: context.loopDepth + 1
        }));
        break;
      }

      case 'ForStatement': {
        // The initializer's declarations are scoped to the complete for-loop.
        const loopScope = new Map(scope);
        if (node.initializer && node.initializer.type === 'VariableDeclaration') {
          visit(node.initializer, loopScope, context);
        } else if (node.initializer) {
          inferExpression(node.initializer.expression, loopScope);
        }
        if (node.condition) {
          const conditionType = inferExpression(node.condition, loopScope);
          if (!['int', 'float', 'bool', 'unknown'].includes(conditionType)) {
            errors.push(`Semantic Error: Loop condition must be numeric or boolean, not ${conditionType}.`);
          }
        }
        const loopContext = {
          ...context,
          loopDepth: context.loopDepth + 1
        };
        node.body.forEach(child => visit(child, loopScope, loopContext));
        if (node.update) inferExpression(node.update, loopScope);
        break;
      }

      case 'TryStatement': {
        const tryScope = new Map(scope);
        node.body.forEach(child => visit(child, tryScope, context));
        const handlerScope = new Map(scope);
        node.handler.forEach(child => visit(child, handlerScope, context));
        break;
      }

      case 'ReturnStatement':
        if (!context.inFunction) {
          errors.push('Semantic Error: DO IT can only be used inside a function.');
        } else if (context.returnType === 'void' && node.value) {
          errors.push('Semantic Error: A SITH function cannot return a value.');
        } else if (context.returnType !== 'void' && !node.value) {
          errors.push(`Semantic Error: Function must return a value of type ${context.returnType}.`);
        } else if (node.value) {
          const actual = inferExpression(node.value, scope);
          reportTypeMismatch(context.returnType, actual, 'Return value');
        }
        break;

      case 'BreakStatement':
        if (context.loopDepth === 0) errors.push('Semantic Error: DONT TRY IT can only be used inside a loop.');
        break;

      case 'ContinueStatement':
        if (context.loopDepth === 0) errors.push('Semantic Error: YOU UNDERESTIMATE MY POWER can only be used inside a loop.');
        break;

      case 'ExpressionStatement':
        inferExpression(node.expression, scope);
        break;
    }
  }

  if (ast.type === 'File') {
    ast.body.forEach(child => collectFunctions(child, true));
  } else {
    collectFunctions(ast, true);
  }
  visit(ast);

  if (errors.length > 0) {
    return { success: false, error: errors.join('\n') };
  }
  return { success: true, symbolTable };
}

module.exports = { analyze };
