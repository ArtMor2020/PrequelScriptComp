// Converts PrequelScript source into typed tokens and reports lexical errors
// with line and column locations.

function tokenize(input) {
  const tokens = [];
  let cursor = 0;
  let line = 1;
  let column = 1;

  // Keep the full phrases here so longer phrases can be matched before prefixes.
  const keywordsAndOps = [
    // Program Structure & Blocks
    "THIS IS WHERE THE FUN BEGINS",
    "ANOTHER HAPPY ENDING",
    
    // I/O Operations
    "HELLO THERE",
    "GENERAL KENOBI",
    
    // Conditionals
    "YOU WERE THE CHOSEN ONE",
    "YOU WERE SUPPOSED TO DESTROY THE SITH",
    "PERHAPS THE ARCHIVES ARE INCOMPLETE",
    
    // Loops & Control Flow
    "THIS IS GETTING OUT OF HAND",
    "I WANT MORE",
    "UNLIMITED POWAH",
    "DONT TRY IT",
    "YOU UNDERESTIMATE MY POWER",
    
    // Functions & Returns
    "KILL HIM",
    "KILL HIM NOW",
    "DO IT",
    
    // System Actions & Errors
    "EXECUTE ORDER 66",
    "WHAT HAVE I DONE",
    "IS IT POSSIBLE TO LEARN THIS POWER",
    "NOT FROM A JEDI",
    "DID YOU EVER HEAR THE TRAGEDY OF DARTH PLAGUEIS THE WISE",
    
    // Data Types
    "MASTER YODA",
    "JEDI",
    "YOUNGLING",
    "MASTER",
    "MASTER JEDI",
    "I HATE SAND",
    "HIGH GROUND",
    "SITH",
    "WOOKIEE",
    
    // Operators & Assignment
    "YOU ARE A BOLD ONE",
    "YOU ARE ON THIS COUNCIL",
    "NOW THERE ARE TWO OF THEM",
    "WE ARE STILL FLYING HALF A SHIP",
    "NOOOO",
    "THERE IS ALWAYS A BIGGER FISH",
    "YOU ARE SHORTER THAN I EXPECTED"
  ];

  // Sort longest-first so multi-word phrases win over shorter keyword prefixes.
  keywordsAndOps.sort((a, b) => b.length - a.length);

  function hasWordBoundaryAfter(length) {
    return !/[a-zA-Z0-9_]/.test(input[cursor + length] || '');
  }

  while (cursor < input.length) {
    let char = input[cursor];

    // Track newlines
    if (char === '\n') {
      line++;
      column = 1;
      cursor++;
      continue;
    }

    // Skip whitespace
    if (/\s/.test(char)) {
      cursor++;
      column++;
      continue;
    }

    // Check for comment keyword
    const comment = "DID YOU EVER HEAR THE TRAGEDY OF DARTH PLAGUEIS THE WISE";
    if (input.startsWith(comment, cursor) && hasWordBoundaryAfter(comment.length)) {
      // Consume until the end of the line
      while (cursor < input.length && input[cursor] !== '\n') {
        cursor++;
      }
      continue;
    }

    // Check for multi-word or single-word keywords/operators
    let matchedToken = null;
    for (let item of keywordsAndOps) {
      if (input.startsWith(item, cursor) && hasWordBoundaryAfter(item.length)) {
        matchedToken = item;
        break;
      }
    }

    if (matchedToken) {
      tokens.push({
        type: 'KEYWORD',
        value: matchedToken,
        line,
        column
      });
      cursor += matchedToken.length;
      column += matchedToken.length;
      continue;
    }

    // Check for String Literals
    if (char === '"') {
      let startCol = column;
      cursor++;
      column++;
      let strVal = '"';
      let terminated = false;
      while (cursor < input.length) {
        if (input[cursor] === '\\' && cursor + 1 < input.length) {
          strVal += input[cursor] + input[cursor + 1];
          cursor += 2;
          column += 2;
        } else if (input[cursor] === '"') {
          strVal += '"';
          cursor++;
          column++;
          terminated = true;
          break;
        } else if (input[cursor] === '\n') {
          break;
        } else {
          strVal += input[cursor];
          cursor++;
          column++;
        }
      }
      if (terminated) {
        tokens.push({ type: 'STRING', value: strVal, line, column: startCol });
        continue;
      } else {
        return { success: false, error: `Unterminated string literal at line ${line}, column ${startCol}` };
      }
    }

    // Check for Numbers
    if (/[0-9]/.test(char)) {
      let startCol = column;
      let numStr = '';
      while (cursor < input.length && /[0-9]/.test(input[cursor])) {
        numStr += input[cursor];
        cursor++;
        column++;
      }
      if (input[cursor] === '.' && /[0-9]/.test(input[cursor + 1] || '')) {
        numStr += '.';
        cursor++;
        column++;
        while (cursor < input.length && /[0-9]/.test(input[cursor])) {
          numStr += input[cursor];
          cursor++;
          column++;
        }
      }
      tokens.push({ type: 'NUMBER', value: numStr, line, column: startCol });
      continue;
    }

    // Check for Identifiers (variable names, function names)
    if (/[a-zA-Z_]/.test(char)) {
      let startCol = column;
      let idStr = '';
      while (cursor < input.length && /[a-zA-Z0-9_]/.test(input[cursor])) {
        idStr += input[cursor];
        cursor++;
        column++;
      }
      tokens.push({ type: 'IDENTIFIER', value: idStr, line, column: startCol });
      continue;
    }

    // Check for Symbols and Delimiters
    if (/[();,{}\+\-\*\/=!<>&\|%\[\]?]/.test(char)) {
      tokens.push({ type: 'SYMBOL', value: char, line, column });
      cursor++;
      column++;
      continue;
    }

    // If an invalid character is found, trigger a Lexical Error with line & column info!
    return { 
      success: false, 
      error: `Lexical error: Unexpected character '${char}' at line ${line}, column ${column}` 
    };
  }

  return { success: true, tokens };
}

module.exports = { tokenize };