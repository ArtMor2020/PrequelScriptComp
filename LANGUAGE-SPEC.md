# Especificação da Linguagem PrequelScript

## Identidade e objetivo

PrequelScript é uma pequena linguagem educacional inspirada em falas marcantes
dos filmes prelúdio de Star Wars. Suas frases substituem palavras-chave
convencionais, mas a linguagem mantém conceitos familiares de programação. O
tradutor demonstra análise léxica, análise sintática baseada em AST,
verificações semânticas e tradução para Python executável. As frases formam um
vocabulário temático; não são simples substituições de texto.

O compilador recebe o código-fonte, tokeniza o conteúdo, analisa os tokens para
construir uma AST, verifica a consistência semântica básica e gera código
Python. A IDE executa o código gerado e oferece um terminal interativo para
entrada de dados.

## Tokens e significados

| PrequelScript | Significado |
|---|---|
| `THIS IS WHERE THE FUN BEGINS` / `ANOTHER HAPPY ENDING` | Início / fim de programa ou bloco |
| `JEDI`, `YOUNGLING`, `MASTER`, `MASTER YODA`, `WOOKIEE`, `MASTER JEDI`, `I HATE SAND`, `HIGH GROUND JEDI`, `SITH` | Tipos inteiro, inteiro curto, inteiro longo, caractere, texto, ponto flutuante, ponto flutuante, intenção de inteiro sem sinal e vazio |
| `YOU ARE ON THIS COUNCIL` | Atribuição |
| `HELLO THERE` / `GENERAL KENOBI` | Saída formatada / entrada interativa |
| `YOU WERE THE CHOSEN ONE` | `if` |
| `PERHAPS THE ARCHIVES ARE INCOMPLETE` | `else if` |
| `YOU WERE SUPPOSED TO DESTROY THE SITH` | `else` |
| `THIS IS GETTING OUT OF HAND` / `UNLIMITED POWAH` | Laço `while` condicional / infinito |
| `I WANT MORE` | Laço `for` no estilo C |
| `NOW THERE ARE TWO OF THEM` / `WE ARE STILL FLYING HALF A SHIP` | Incremento / decremento |
| `DONT TRY IT` / `YOU UNDERESTIMATE MY POWER` | `break` / `continue` |
| `KILL HIM` / `KILL HIM NOW` / `DO IT` | Declaração de função / chamada / retorno |
| `EXECUTE ORDER 66` / `WHAT HAVE I DONE` | Encerramento com status 0 / -1 |
| `IS IT POSSIBLE TO LEARN THIS POWER` / `NOT FROM A JEDI` | `try` / bloco de tratamento de exceção |
| `YOU ARE A BOLD ONE` / `THERE IS ALWAYS A BIGGER FISH` / `YOU ARE SHORTER THAN I EXPECTED` | Igual / maior que / menor que |
| `DID YOU EVER HEAR THE TRAGEDY OF DARTH PLAGUEIS THE WISE` | Comentário até o fim da linha |

Os identificadores começam com letras ASCII ou `_`, seguidos por letras ASCII,
dígitos ou `_`. São reconhecidos literais inteiros e decimais, strings entre
aspas duplas e os sinais de pontuação `()[]{},;?&`.

Os operadores simbólicos aceitos incluem `=`, `==`, `!=`, `<`, `>`, `<=`, `>=`,
`+`, `-`, `*`, `/`, `//`, `%`, `&&`, `||` e `!`. `&&` e `||` são traduzidos para
`and` e `or` em Python. `//` representa divisão inteira arredondada para baixo.
Instruções simples terminam com ponto e vírgula; blocos compostos terminam com
`ANOTHER HAPPY ENDING`.

Os tipos declarados descrevem a intenção do programa. Python não emula a
largura de inteiros nem o estouro de valores sem sinal de C. `JEDI`,
`YOUNGLING`, `MASTER` e `HIGH GROUND JEDI` são representados como inteiros do
Python; `MASTER YODA`, como uma string de um caractere; `WOOKIEE`, como texto;
`MASTER JEDI` e `I HATE SAND`, como números de ponto flutuante; e `SITH`, como
ausência de valor de retorno.

## EBNF

A gramática a seguir descreve a sintaxe principal suportada. Espaços em branco
e comentários podem aparecer entre tokens. `Identifier`, `Number` e `String`
são classes de tokens retornadas pelo analisador léxico.

```ebnf
file              = { function-declaration | program } ;
program           = "THIS IS WHERE THE FUN BEGINS", { statement },
                    "ANOTHER HAPPY ENDING" ;

function-declaration
                  = "KILL HIM", type, Identifier, "(",
                    [ parameter-list ], ")", { statement },
                    "ANOTHER HAPPY ENDING"
                  | "KILL HIM", "(", type, Identifier, "(",
                    [ parameter-list ], ")", ")", { statement },
                    "ANOTHER HAPPY ENDING" ;
parameter-list    = parameter, { ",", parameter } ;
parameter         = type, Identifier, [ "[", "]" ] ;

statement         = variable-declaration
                  | print-statement
                  | input-statement
                  | if-statement
                  | while-statement
                  | for-statement
                  | infinite-loop
                  | return-statement
                  | function-call, ";"
                  | break-statement
                  | continue-statement
                  | exit-statement
                  | try-statement
                  | expression, ";" ;

variable-declaration
                  = type, Identifier, [ "[", expression, "]" ],
                    [ assignment, expression ], ";" ;
type              = "JEDI" | "YOUNGLING" | "MASTER" | "MASTER YODA"
                  | "WOOKIEE" | "MASTER JEDI" | "I HATE SAND"
                  | "HIGH GROUND JEDI" | "SITH" ;
assignment        = "YOU ARE ON THIS COUNCIL" | "=" ;
variable-declaration-without-semicolon
                  = type, Identifier, [ "[", expression, "]" ],
                    [ assignment, expression ] ;

print-statement   = "HELLO THERE", [ "?" ],
                    ( "(", [ expression, { ",", expression } ], ")" |
                      [ expression ] ), ";" ;
input-statement   = "GENERAL KENOBI", [ "?" ],
                    ( "(", ( [ String, [ ",", [ "&" ], Identifier,
                      { ",", [ "&" ], Identifier } ] ] |
                      [ "&" ], Identifier, { ",", [ "&" ], Identifier } ),
                      ")" |
                      [ "&" ], Identifier ), ";" ;

if-statement      = "YOU WERE THE CHOSEN ONE", [ "?" ], "(",
                    expression, ")",
                    { statement },
                    { "PERHAPS THE ARCHIVES ARE INCOMPLETE", [ "?" ], "(",
                      expression, ")", { statement } },
                    [ "YOU WERE SUPPOSED TO DESTROY THE SITH",
                      { statement } ],
                    "ANOTHER HAPPY ENDING" ;
while-statement   = "THIS IS GETTING OUT OF HAND", [ "?" ], "(",
                    expression, ")", { statement },
                    "ANOTHER HAPPY ENDING" ;
infinite-loop     = "UNLIMITED POWAH", { statement },
                    "ANOTHER HAPPY ENDING" ;
for-statement     = "I WANT MORE", "(",
                    [ variable-declaration-without-semicolon | expression ],
                    ";", [ expression ], ";", [ expression ], ")",
                    { statement }, "ANOTHER HAPPY ENDING" ;
return-statement  = "DO IT", [ expression ], ";" ;
break-statement   = "DONT TRY IT", ";" ;
continue-statement= "YOU UNDERESTIMATE MY POWER", ";" ;
exit-statement    = ( "EXECUTE ORDER 66" | "WHAT HAVE I DONE" ), ";" ;
try-statement     = "IS IT POSSIBLE TO LEARN THIS POWER", { statement },
                    "NOT FROM A JEDI", { statement },
                    "ANOTHER HAPPY ENDING" ;

expression        = unary, { binary-operator, unary } ;
unary             = [ "!" | "NOOOO" | "+" | "-" |
                      "NOW THERE ARE TWO OF THEM" |
                      "WE ARE STILL FLYING HALF A SHIP" ], primary,
                    [ "NOW THERE ARE TWO OF THEM" |
                      "WE ARE STILL FLYING HALF A SHIP" ] ;
primary           = Number | String | Identifier
                  | function-call
                  | primary, "[", expression, "]"
                  | "(", expression, ")"
                  | "{", [ expression, { ",", expression } ], "}" ;
function-call     = ( Identifier | "KILL HIM NOW", Identifier ),
                    "(", [ expression, { ",", expression } ], ")" ;
binary-operator   = assignment | "||" | "&&" | "YOU ARE A BOLD ONE"
                  | "==" | "!=" | ">" | "<" | ">=" | "<="
                  | "THERE IS ALWAYS A BIGGER FISH"
                  | "YOU ARE SHORTER THAN I EXPECTED"
                  | "+" | "-" | "*" | "/" | "//" | "%" ;
```

A precedência dos operadores, da menor para a maior, é: atribuição, OR, AND,
igualdade, operadores relacionais, adição/subtração e
multiplicação/divisão/módulo. A atribuição é associativa à direita; os demais
operadores binários são associativos à esquerda.

## Exemplos de programas válidos

Os exemplos completos e executáveis estão em [`Examples.txt`](./Examples.txt):

1. Bubble sort — vetores, laços `for` aninhados, comparações e atribuições.
2. Prova de idade — entrada interativa e `if/else`.
3. Fatorial recursivo — declaração e chamada de função, além de retorno.
4. Busca binária recursiva — parâmetros de vetor, indexação, recursão e
   operadores relacionais.
5. Contagem até um limite informado pelo usuário — entrada, decisão e repetição
   em um único programa.
6. Máximo divisor comum — função com parâmetros, laço `while`, módulo e valor
   de retorno.
7. Fibonacci recursivo — chamadas recursivas e retorno completo em `if/else`.

## Exemplos de erros

Os exemplos intencionalmente inválidos estão em
[`Examples-Errors.txt`](./Examples-Errors.txt) e são verificados pelos testes
automatizados:

**Erro léxico — caractere inesperado**

```text
THIS IS WHERE THE FUN BEGINS
JEDI count @;
ANOTHER HAPPY ENDING
```

Esperado: indicação do caractere inesperado `@`, com a linha e a coluna do
código-fonte.

**Erro sintático — ponto e vírgula ausente**

```text
THIS IS WHERE THE FUN BEGINS
JEDI count YOU ARE ON THIS COUNCIL 1
ANOTHER HAPPY ENDING
```

Esperado: `Expected ';' after statement`.

**Erro semântico — tipos incompatíveis**

```text
THIS IS WHERE THE FUN BEGINS
JEDI count YOU ARE ON THIS COUNCIL 1;
count YOU ARE ON THIS COUNCIL "not a number";
ANOTHER HAPPY ENDING
```

Esperado: diagnóstico de incompatibilidade de tipos na atribuição.

Outras verificações semânticas incluem variáveis não declaradas ou duplicadas,
operandos inválidos em operações aritméticas e comparações, indexação inválida
de vetores, tipos incorretos em argumentos e retornos de funções e uso de
`break`/`continue`/`return` fora do contexto permitido.
