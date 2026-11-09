# PrequelScript

PrequelScript é uma pequena linguagem inspirada nos filmes prelúdio de Star
Wars, implementada como um pipeline de compilação. Ela tokeniza o código-fonte,
constrói uma árvore sintática abstrata (AST), realiza verificações semânticas
básicas, gera código Python e executa esse código na IDE.

## Requisitos

- Node.js 18 ou superior
- Python 3 disponível como `python` no `PATH`
- Navegador com JavaScript habilitado

## Executar a IDE

```sh
npm install
npm start
```

Abra <http://localhost:3000>. Escolha um exemplo na lista ou edite o código e
selecione **Execute Order 66 (Run)**. Programas que solicitam entrada leem as
linhas digitadas no terminal de execução. Pressione **Stop** para encerrar um
programa em execução.

Para selecionar outro executável do Python, defina `PYTHON` antes de iniciar o
servidor. Por exemplo, no PowerShell:

```powershell
$env:PYTHON = "py"
npm start
```

Execute a suíte automatizada de testes com:

```sh
npm test
```

## Estrutura do projeto

- `compiler/lexer.js` — tokens do código-fonte e erros léxicos
- `compiler/parser.js` — validação sintática e construção da AST
- `compiler/semantic.js` — declarações, compatibilidade de tipos e verificações de contexto
- `compiler/codegen.js` — geração de código Python
- `server.js` — endpoint do compilador e execução interativa
- `public/` — IDE e guia da linguagem
- `Examples.txt` — programas de exemplo executáveis na IDE
- `Examples-Errors.txt` — exemplos intencionalmente inválidos para demonstrar os diagnósticos do compilador
- `LANGUAGE-SPEC.md` — motivação da linguagem, tabela de tokens, EBNF e exemplos
