function LogoInterpreter(turtle, stream, savehook)
{
  'use strict';

  var self = this;

  var UNARY_MINUS = '<UNARYMINUS>'; 

  var ERRORS = {
    BAD_INPUT: 4,
    NO_OUTPUT: 5,
    NOT_ENOUGH_INPUTS: 6,
    TOO_MANY_INPUTS: 8,
    BAD_OUTPUT: 9,
    MISSING_PAREN: 10,
    BAD_VAR: 11,
    BAD_PAREN: 12,
    ALREADY_DEFINED: 15,
    THROW_ERROR: 21,
    IS_PRIMITIVE: 22,
    BAD_PROC: 24,
    NO_TEST: 25,
    BAD_BRACKET: 26,
    BAD_BRACE: 27,
    USER_GENERATED: 35,
    MISSING_SPACE: 39
  };

  function saveproc(name, def) {
    if (savehook)
      savehook(String(name).toLowerCase(), def);
  }

  function format(string, params) {
    return string.replace(/{(\w+)(:[UL])?}/g, function(m, n, o) {
      var s = (n === '_PROC_') ? self.stack[self.stack.length - 1] : String(params[n]);
      switch (o) {
        case ':U': return s.toUpperCase();
        case ':L': return s.toLowerCase();
        default: return s;
      }
    });
  }

  this.localize = null;
  function __(string) {
    if (self.localize)
      return self.localize(string) || string;
    return string;
  }

  function err(string, params, code) {

    if (typeof params === 'number') {
      code = params;
      params = undefined;
    }
    var error = new LogoError('ERROR', undefined, format(__(string), params));
    if (code !== undefined)
      error.code = code;
    return error;
  }

  function LogoError(tag, value, message) {
    this.name = 'LogoError';
    this.message = message || format(__('No CATCH for tag {tag}'), {tag: tag});
    this.tag = tag;
    this.value = value;
    this.proc = self.stack[self.stack.length - 1];
    this.code = -1; 
    this.line = -1; 
  }

  this.keywordAlias = null;
  function isKeyword(atom, match) {
    if (Type(atom) !== 'word')
      return false;
    atom = String(atom).toUpperCase();
    if (self.keywordAlias)
      atom = self.keywordAlias(atom) || atom;
    return atom === match;
  }

  function promiseLoop(func) {
    return new Promise(function(resolve, reject) {
      (function loop() {
        try {
          func(loop, resolve, reject);
        } catch (e) {
          reject(e);
        }
      }());
    });
  }

  function serialExecute(funcs) {
    var results = [];
    return promiseLoop(function(loop, resolve, reject) {
      if (!funcs.length) {
        resolve(results);
        return;
      }
      Promise.resolve(funcs.shift()())
        .then(function(result) {
          results.push(result);
          loop();
        }, reject);
    });
  }

  function promiseFinally(promise, finalBlock) {
    return promise
      .then(function(result) {
        return Promise.resolve(finalBlock())
          .then(function() {
            return result;
          });
      }, function(err) {
        return Promise.resolve(finalBlock())
          .then(function() {
            throw err;
          });
      });
  }

  var lastTimeYielded = Date.now();
  function promiseYield() {
    var currentTime = Date.now();
    if (currentTime - lastTimeYielded > 20) {
      lastTimeYielded = currentTime;
      return new Promise(function(resolve) {
        setTimeout(resolve, 0);
      });
    } else {
      return Promise.resolve();
    }
  }
  
  function promiseYieldTime(msec) {

    lastTimeYielded = Date.now() + msec * 2;
    return new Promise(function(resolve) {
      setTimeout(resolve, msec);
    });
  }

  function to_arity($$func$$, arity) {
    var parms = [];

    if ($$func$$.length === arity)
      return $$func$$;

    for (var i = 0; i < arity; ++i)
      parms.push('a' + i);

    var f = eval('(function ' + $$func$$.name + '(' + parms.join(',') + ')' +
                 '{ return $$func$$.apply(this, arguments); })');
    return f;
  }

  function PRNG(seed) {
    var S = seed & 0x7fffffff, 
        A = 48271, 
        M = 0x7fffffff, 
        Q = M / A,
        R = M % A;

    this.next = function PRNG_next() {
      var hi = S / Q,
          lo = S % Q,
          t = A * lo - R * hi;
      S = (t > 0) ? t : t + M;
      this.last = S / M;
      return this.last;
    };
    this.seed = function PRNG_seed(x) {
      S = x & 0x7fffffff;
    };
    this.next();
  }

  function StringMap(case_fold) {
    this._map = new Map();
    this._case_fold = case_fold;
  }
  Object.defineProperties(StringMap.prototype, {
    get: {value: function(key) {
      key = this._case_fold ? String(key).toLowerCase() : String(key);
      return this._map.get(key);
    }},
    set: {value: function(key, value) {
      key = this._case_fold ? String(key).toLowerCase() : String(key);
      this._map.set(key, value);
    }},
    has: {value: function(key) {
      key = this._case_fold ? String(key).toLowerCase() : String(key);
      return this._map.has(key);
    }},
    delete: {value: function(key) {
      key = this._case_fold ? String(key).toLowerCase() : String(key);
      return this._map.delete(key);
    }},
    keys: {value: function() {
      var keys = [];
      this._map.forEach(function(value, key) { keys.push(key); });
      return keys;
    }},
    empty: {value: function() {
      return this._map.size === 0;
    }},
    forEach: {value: function(fn) {
      return this._map.forEach(function(value, key) {
        fn(key, value);
      });
    }}
  });

  function LogoArray(size, origin) {
    this._array = [];
    this._array.length = size;
    for (var i = 0; i < this._array.length; ++i)
      this._array[i] = [];
    this._origin = origin;
  }
  LogoArray.from = function(list, origin) {
    var array = new LogoArray(0, origin);
    array._array = Array.from(list);
    return array;
  };
  Object.defineProperties(LogoArray.prototype, {
    item: {value: function(i) {
      i = Number(i)|0;
      i -= this._origin;
      if (i < 0 || i >= this._array.length)
        throw err("{_PROC_}: Index out of bounds", ERRORS.BAD_INPUT);
      return this._array[i];
    }},
    setItem: {value: function(i, v) {
      i = Number(i)|0;
      i -= this._origin;
      if (i < 0 || i >= this._array.length)
        throw err("{_PROC_}: Index out of bounds", ERRORS.BAD_INPUT);
      this._array[i] = v;
    }},
    list: {get: function() {
      return this._array;
    }},
    origin: {get: function() {
      return this._origin;
    }},
    length: {get: function() {
      return this._array.length;
    }}
  });

  function Stream(string) {
    this._string = string;
    this._index = 0;
    this._skip();
  }
  
  Object.defineProperties(Stream.prototype, {
    eof: {get: function() {
      return this._index >= this._string.length;
    }},
    
    peek: {value: function() {
        var c = this._string.charAt(this._index);
        if (c === '\\')
          c += this._string.charAt(this._index + 1);
        return c;
      }},
      get: {value: function() {
        var c = this._next();
        this._skip();
        return c;
      }},
      _next: {value: function() {
        var c = this._string.charAt(this._index++);
        if (c === '\\')
          c += this._string.charAt(this._index++);
        return c;
      }},
      _skip: {value: function() {
        while (!this.eof) {
          var c = this.peek();
          if (c === '~' && this._string.charAt(this._index + 1) === '\n') {
            this._index += 2;
          } else if (c === ';') {
            do {
              c = this._next();
            } while (!this.eof && this.peek() !== '\n');
            if (c === '~')
              this._next();
          } else {
            return;
          }
        }
      }},
      rest: {get: function() {
        return this._string.substring(this._index);
      }}
    });
  
    self.turtle = turtle;
    self.stream = stream;
    self.routines = new StringMap(true);
    self.scopes = [new StringMap(true)];
    self.plists = new StringMap(true);
    self.prng = new PRNG(Math.random() * 0x7fffffff);
    self.forceBye = false;

    function Output(output) { this.output = output; }
    Output.prototype.toString = function() { return this.output; };
    Output.prototype.valueOf = function() { return this.output; };

    function Bye() { }
  
    function Type(atom) {
      if (atom === undefined) {

        throw err("No output from procedure", ERRORS.NO_OUTPUT);
      } else if (typeof atom === 'string' || typeof atom === 'number') {
        return 'word';
      } else if (Array.isArray(atom)) {
        return 'list';
      } else if (atom instanceof LogoArray) {
        return 'array';
      } else if ('then' in Object(atom)) {
        throw new Error("Internal error: Unexpected value: a promise");
      } else if (!atom) {
        throw new Error("Internal error: Unexpected value: null");
      } else {
        throw new Error("Internal error: Unexpected value: unknown type");
      }
    }
  
    function parse(string) {
      if (string === undefined) {
        return undefined; 
      }
  
      var atoms = [],
          prev, r;
  
      var stream = new Stream(string);
      while (stream.peek()) {
        var atom;

        var leading_space = isWS(stream.peek());
        while (isWS(stream.peek()))
          stream.get();
        if (!stream.peek())
          break;
  
        if (stream.peek() === '[') {
          stream.get();
          atom = parseList(stream);
        } else if (stream.peek() === ']') {
          throw err("Unexpected ']'", ERRORS.BAD_BRACKET);
        } else if (stream.peek() === '{') {
          stream.get();
          atom = parseArray(stream);
        } else if (stream.peek() === '}') {
          throw err("Unexpected '}'", ERRORS.BAD_BRACE);
        } else if (stream.peek() === '"') {
          atom = parseQuoted(stream);
        } else if (isOwnWord(stream.peek())) {
          atom = stream.get();
        } else if (inRange(stream.peek(), '0', '9')) {
          atom = parseNumber(stream);
        } else if (inChars(stream.peek(), OPERATOR_CHARS)) {
          atom = parseOperator(stream);
  
          if (atom === '-') {
            var trailing_space = isWS(stream.peek());
            if (prev === undefined ||
                (Type(prev) === 'word' && isInfix(prev)) ||
                (Type(prev) === 'word' && prev === '(') ||
                (leading_space && !trailing_space)) {
              atom = UNARY_MINUS;
            }
          }
        } else if (!inChars(stream.peek(), WORD_DELIMITER)) {
          atom = parseWord(stream);
        } else {

          throw err("Couldn't parse: '{string}'", { string: stream.rest });
        }
        atoms.push(atom);
        prev = atom;
      }
  
      return atoms;
    }
  
    function inRange(x, a, b) {
      return a <= x && x <= b;
    }
  
    function inChars(x, chars) {
      return x && chars.indexOf(x) !== -1;
    }
  
    var WS_CHARS = ' \f\n\r\t\v';
    function isWS(c) {
      return inChars(c, WS_CHARS);
    }

  var QUOTED_DELIMITER = WS_CHARS + '[](){}';
  function parseQuoted(stream) {
    var word = '';
    while (!stream.eof && QUOTED_DELIMITER.indexOf(stream.peek()) === -1) {
      var c = stream.get();
      word += (c.charAt(0) === '\\') ? c.charAt(1) : c.charAt(0);
    }
    return word;
  }

  var OWNWORD_CHARS = '\u2190\u2191\u2192\u2193';
  function isOwnWord(c) {
    return inChars(c, OWNWORD_CHARS);
  }
 this

  var WORD_DELIMITER = WS_CHARS + '[](){}+-*/%^=<>';
  function parseWord(stream) {
    var word = '';
    while (!stream.eof && WORD_DELIMITER.indexOf(stream.peek()) === -1) {
      var c = stream.get();
      word += (c.charAt(0) === '\\') ? c.charAt(1) : c.charAt(0);
    }
    return word;
  }

  var OPERATOR_CHARS = '+-*/%^=<>[]{}()';
  function parseOperator(stream) {
    var word = '';
    if (inChars(stream.peek(), OPERATOR_CHARS))
      word += stream.get();
    if ((word === '<' && stream.peek() === '=') ||
        (word === '>' && stream.peek() === '=') ||
        (word === '<' && stream.peek() === '>')) {
      word += stream.get();
    }
    return word;
  }

  function isInfix(word) {
    return ['+', '-', '*', '/', '%', '^', '=', '<', '>', '<=', '>=', '<>']
      .includes(word);
  }

  function isOperator(word) {
    return isInfix(word) || ['[', ']', '{', '}', '(', ')'].includes(word);
  }

  function parseNumber(stream) {
    var word = '';
    while (inRange(stream.peek(), '0', '9'))
      word += stream.get();
    if (stream.peek() === '.')
      word += stream.get();
    if (inRange(stream.peek(), '0', '9')) {
      while (inRange(stream.peek(), '0', '9'))
        word += stream.get();
    }
    if (stream.peek() === 'E' || stream.peek() === 'e') {
      word += stream.get();
      if (stream.peek() === '-' || stream.peek() === '+')
        word += stream.get();
      while (inRange(stream.peek(), '0', '9'))
        word += stream.get();
    }
    return word;
  }

  function isNumber(s) {
    return String(s).match(/^-?([0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)$/);
  }

  function parseInteger(stream) {
    var word = '';
    if (stream.peek() === '-')
      word += stream.get();
    while (inRange(stream.peek(), '0', '9'))
      word += stream.get();
    return word;
  }

  function parseList(stream) {
    var list = [],
        atom = '',
        c, r;

    for (;;) {
      do {
        c = stream.get();
      } while (isWS(c));

      while (c && !isWS(c) && '[]{}'.indexOf(c) === -1) {
        atom += c;
        c = stream.get();
      }

      if (atom.length) {
        list.push(atom);
        atom = '';
      }

      if (!c)
        throw err("Expected ']'", ERRORS.BAD_BRACKET);
      if (isWS(c))
        continue;
      if (c === ']')
        return list;
      if (c === '[') {
        list.push(parseList(stream));
        continue;
      }
      if (c === '{') {
        list.push(parseArray(stream));
        continue;
      }
      if (c === '}')
        throw err("Unexpected '}'", ERRORS.BAD_BRACE);
      throw err("Unexpected '{c}'", {c: c});
    }
  }
  function parseArray(stream) {
    var list = [],
        origin = 1,
        atom = '',
        c, r;
  
    for (;;) {
      do {
        c = stream.get();
      } while (isWS(c));
  
      while (c && !isWS(c) && '[]{}'.indexOf(c) === -1) {
        atom += c;
        c = stream.get();
      }
  
      if (atom.length) {
        list.push(atom);
        atom = '';
      }
  
      if (!c)
        throw err("Expected '}'", ERRORS.BAD_BRACE);
      if (isWS(c))
        continue;
      if (c === '}') {
        while (isWS(stream.peek()))
          stream.get();
        if (stream.peek() === '@') {
          stream.get();
          while (isWS(stream.peek()))
            stream.get();
          origin = Number(parseInteger(stream) || 0);
        }
        return LogoArray.from(list, origin);
      }
      if (c === '[') {
        list.push(parseList(stream));
        continue;
      }
      if (c === ']')
        throw err("Unexpected ']'", ERRORS.BAD_BRACKET);
      if (c === '{') {
        list.push(parseArray(stream));
        continue;
      }
      throw err("Unexpected '{c}'", {c: c});
    }
  }
  
    function reparse(list) {
      return parse(stringify_nodecorate(list).replace(/([\\;])/g, '\\$1'));
    }
  
    function maybegetvar(name) {
      var lval = lvalue(name);
      return lval ? lval.value : undefined;
    }
  
    function getvar(name) {
      var value = maybegetvar(name);
      if (value !== undefined)
        return value;
      throw err("Don't know about variable {name:U}", {name: name}, ERRORS.BAD_VAR);
    }
  
    function lvalue(name) {
      for (var i = self.scopes.length - 1; i >= 0; --i) {
        if (self.scopes[i].has(name)) {
          return self.scopes[i].get(name);
        }
      }
      return undefined;
    }
  
    function setvar(name, value) {
      value = copy(value);

      var lval = lvalue(name);
      if (lval) {
        lval.value = value;
      } else {

        lval = {value: value};
        self.scopes[0].set(name, lval);
      }
    }
  
    function local(name) {
      var scope = self.scopes[self.scopes.length - 1];
      scope.set(sexpr(name), {value: undefined});
    }
  
    function setlocal(name, value) {
      value = copy(value);
      var scope = self.scopes[self.scopes.length - 1];
      scope.set(sexpr(name), {value: value});
    }

    function peek(list, options) {
      if (list.length < 1) { return false; }
      var next = list[0];
      return options.some(function(x) { return next === x; });
  
    }
  
    function evaluateExpression(list) {
      return (expression(list))();
    }
  
    function expression(list) {
      return relationalExpression(list);
    }
  
    function relationalExpression(list) {
      var lhs = additiveExpression(list);
      var op;
      while (peek(list, ['=', '<', '>', '<=', '>=', '<>'])) {
        op = list.shift();
  
        lhs = function(lhs) {
          var rhs = additiveExpression(list);
  
          switch (op) {
            case "<": return defer(function(lhs, rhs) { return (aexpr(lhs) < aexpr(rhs)) ? 1 : 0; }, lhs, rhs);
            case ">": return defer(function(lhs, rhs) { return (aexpr(lhs) > aexpr(rhs)) ? 1 : 0; }, lhs, rhs);
            case "=": return defer(function(lhs, rhs) { return equal(lhs, rhs) ? 1 : 0; }, lhs, rhs);
  
            case "<=": return defer(function(lhs, rhs) { return (aexpr(lhs) <= aexpr(rhs)) ? 1 : 0; }, lhs, rhs);
            case ">=": return defer(function(lhs, rhs) { return (aexpr(lhs) >= aexpr(rhs)) ? 1 : 0; }, lhs, rhs);
            case "<>": return defer(function(lhs, rhs) { return !equal(lhs, rhs) ? 1 : 0; }, lhs, rhs);
            default: throw new Error("Internal error in expression parser");
          }
        } (lhs);
      }
  
      return lhs;
    }
  
    function defer(func /*, input...*/) {
      var input = [].slice.call(arguments, 1);
      return function() {
        return serialExecute(input.slice())
          .then(function(args) {
            return func.apply(null, args);
          });
      };
    }
  
    function additiveExpression(list) {
      var lhs = multiplicativeExpression(list);
      var op;
      while (peek(list, ['+', '-'])) {
        op = list.shift();
        

      lhs = function(lhs) {
        var rhs = multiplicativeExpression(list);
        switch (op) {
          case "+": return defer(function(lhs, rhs) { return aexpr(lhs) + aexpr(rhs); }, lhs, rhs);
          case "-": return defer(function(lhs, rhs) { return aexpr(lhs) - aexpr(rhs); }, lhs, rhs);
          default: throw new Error("Internal error in expression parser");
        }
      } (lhs);
    }

    return lhs;
  }

  function multiplicativeExpression(list) {
    var lhs = powerExpression(list);
    var op;
    while (peek(list, ['*', '/', '%'])) {
      op = list.shift();

      lhs = function(lhs) {
        var rhs = powerExpression(list);
        switch (op) {
          case "*": return defer(function(lhs, rhs) { return aexpr(lhs) * aexpr(rhs); }, lhs, rhs);
          case "/": return defer(function(lhs, rhs) {
            var n = aexpr(lhs), d = aexpr(rhs);
            if (d === 0) { throw err("Division by zero", ERRORS.BAD_INPUT); }
            return n / d;
          }, lhs, rhs);
          case "%": return defer(function(lhs, rhs) {
            var n = aexpr(lhs), d = aexpr(rhs);
            if (d === 0) { throw err("Division by zero", ERRORS.BAD_INPUT); }
            return n % d;
          }, lhs, rhs);
          default: throw new Error("Internal error in expression parser");
        }
      } (lhs);
    }

    return lhs;
  }

  function powerExpression(list) {
    var lhs = unaryExpression(list);
    var op;
    while (peek(list, ['^'])) {
      op = list.shift();
      lhs = function(lhs) {
        var rhs = unaryExpression(list);
        return defer(function(lhs, rhs) { return Math.pow(aexpr(lhs), aexpr(rhs)); }, lhs, rhs);
      } (lhs);
    }

    return lhs;
  }

  function unaryExpression(list) {
    var rhs, op;

    if (peek(list, [UNARY_MINUS])) {
      op = list.shift();
      rhs = unaryExpression(list);
      return defer(function(rhs) { return -aexpr(rhs); }, rhs);
    } else {
      return finalExpression(list);
    }
  }

  function finalExpression(list) {
    if (!list.length)
      throw err("Unexpected end of instructions", ERRORS.MISSING_PAREN);

    var atom = list.shift();

    var result, literal, varname;

    switch (Type(atom)) {
    case 'array':
    case 'list':
      return function() { return atom; };

    case 'word':
      if (isNumber(atom)) {

        atom = parseFloat(atom);
        return function() { return atom; };
      }

      atom = String(atom);
      if (atom.charAt(0) === '"' || atom.charAt(0) === "'") {

        literal = atom.substring(1);
        return function() { return literal; };
      }
      if (atom.charAt(0) === ':') {

        varname = atom.substring(1);
        return function() { return getvar(varname); };
      }
      if (atom === '(') {

        if (list.length && Type(list[0]) === 'word' && self.routines.has(String(list[0])) &&
            !(list.length > 1 && Type(list[1]) === 'word' && isInfix(String(list[1])))) {

          atom = list.shift();
          return self.dispatch(atom, list, false);
        }

        result = expression(list);

        if (!list.length)
          throw err("Expected ')'", ERRORS.MISSING_PAREN);
        if (!peek(list, [')']))
          throw err("Expected ')', saw {word}", { word: list.shift() }, ERRORS.MISSING_PAREN);
        list.shift();
        return result;
      }
      if (atom === ')')
        throw err("Unexpected ')'", ERRORS.BAD_PAREN);

      return self.dispatch(atom, list, true);

    default: throw new Error("Internal error in expression parser");
    }
  }

  self.stack = [];

  self.dispatch = function(name, tokenlist, natural) {
    name = name.toUpperCase();
    var procedure = self.routines.get(name);
    if (!procedure) {

      var m;
      if ((m = /^(\w+?)(\d+)$/.exec(name)) && self.routines.get(m[1])) {
        throw err("Need a space between {name:U} and {value}",
                  { name: m[1], value: m[2] }, ERRORS.MISSING_SPACE);
      }

      throw err("Don't know how to {name:U}", { name: name }, ERRORS.BAD_PROC);
    }
    if (procedure.special) {

        self.stack.push(name);
        try {
          procedure.call(self, tokenlist);
          return function() { };
        } finally {
          self.stack.pop();
        }
      }
      
          var args = [];
          if (natural) {

            for (var i = 0; i < procedure.default; ++i) {
              args.push(expression(tokenlist));
            }
          } else {

            while (tokenlist.length && !peek(tokenlist, [')'])) {
              args.push(expression(tokenlist));
            }
            tokenlist.shift(); 
      
            if (args.length < procedure.minimum)
              throw err("Not enough inputs for {name:U}", {name: name}, ERRORS.NOT_ENOUGH_INPUTS);
            if (procedure.maximum !== -1 && args.length > procedure.maximum)
              throw err("Too many inputs for {name:U}", {name: name}, ERRORS.TOO_MANY_INPUTS);
          }
      
          if (procedure.noeval) {
            return function() {
              self.stack.push(name);
              return promiseFinally(procedure.apply(self, args),
                                    function() { self.stack.pop(); });
            };
          }
      
          return function() {
            self.stack.push(name);
            return promiseFinally(serialExecute(args.slice()).then(function(args) {
              return procedure.apply(self, args);
            }), function() { self.stack.pop(); });
          };
        };
      
        function aexpr(atom) {
          if (atom === undefined) {
            throw err("Expected number", ERRORS.BAD_INPUT);
          }
          switch (Type(atom)) {
          case 'word':
            if (isNumber(atom))
              return parseFloat(atom);
            break;
          }
          throw err("Expected number", ERRORS.BAD_INPUT);
        }

        function sexpr(atom) {
          if (atom === undefined) throw err("Expected string", ERRORS.BAD_INPUT);
          if (atom === UNARY_MINUS) return '-';
          if (Type(atom) === 'word') return String(atom);
      
          throw new err("Expected string", ERRORS.BAD_INPUT);
        }

        function lexpr(atom) {
          if (atom === undefined)
            throw err("{_PROC_}: Expected list", ERRORS.BAD_INPUT);
          switch (Type(atom)) {
          case 'word':
            return Array.from(String(atom));
          case 'list':
            return copy(atom);
          }
      
          throw err("{_PROC_}: Expected list", ERRORS.BAD_INPUT);
        }

        function sifw(atom, list) {
          return (Type(atom) === 'word') ? list.join('') : list;
        }

        function copy(value) {
          switch (Type(value)) {
          case 'list': return value.map(copy);
          default: return value;
          }
        }
      
        function equal(a, b) {
          if (Type(a) !== Type(b)) return false;
          switch (Type(a)) {
          case 'word':
            if (typeof a === 'number' || typeof b === 'number')
              return Number(a) === Number(b);
            else
              return String(a) === String(b);
          case 'list':
            if (a.length !== b.length)
              return false;
            for (var i = 0; i < a.length; ++i) {
              if (!equal(a[i], b[i]))
                return false;
            }
            return true;
          case 'array':
            return a === b;
          }
          return undefined;
        }
      
        self.execute = function(statements, options) {
          options = Object(options);

          statements = statements.slice();
      
          var lastResult;
          return promiseLoop(function(loop, resolve, reject) {
            if (self.forceBye) {
              self.forceBye = false;
              reject(new Bye);
              return;
            }
            if (!statements.length) {
              resolve(lastResult);
              return;
            }
            Promise.resolve(evaluateExpression(statements))
              .then(function(result) {
                if (result !== undefined && !options.returnResult) {
                  reject(err("Don't know what to do with {result}", {result: result},
                        ERRORS.BAD_OUTPUT));
                  return;
                }
                lastResult = result;
                loop();
              }, reject);
          });
        };
        
  self.bye = function() {
    self.forceBye = true;
  };

  var lastRun = Promise.resolve();

  self.queueTask = function(task) {
    var promise = lastRun.then(function() {
      return Promise.resolve(task());
    });
    lastRun = promise.catch(function(){});
    return promise;
  };

  self.run = function(string, options) {
    options = Object(options);
    return self.queueTask(function() {
      // Parse it
      var atoms = parse(string);

      return self.execute(atoms, options)
        .catch(function(err) {
          if (!(err instanceof Bye))
            throw err;
        });
    });
  };

  self.definition = function(name, proc) {

    function defn(atom) {
      switch (Type(atom)) {
      case 'word': return String(atom);
      case 'list': return '[ ' + atom.map(defn).join(' ') + ' ]';
      case 'array': return '{ ' + atom.list.map(defn).join(' ') + ' }' +
          (atom.origin === 1 ? '' : '@' + atom.origin);
      default: throw new Error("Internal error: unknown type");
      }
    }

    var def = "to " + name;

    def += proc.inputs.map(function(i) {
      return ' :' + i;
    }).join('');
    def += proc.optional_inputs.map(function(op) {
      return ' [:' + op[0] + ' ' + op[1].map(defn).join(' ') + ']';
    }).join('');
    if (proc.rest)
      def += ' [:' + proc.rest + ']';
    if (proc.def !== undefined)
      def += ' ' + proc.def;

    def += "\n";
    def += "  " + proc.block.map(defn).join(" ").replace(new RegExp(UNARY_MINUS + ' ', 'g'), '-');
    def += "\n" + "end";

    return def;
  };

  self.procdefs = function() {
    var defs = [];
    self.routines.forEach(function(name, proc) {
      if (!proc.primitive) {
        defs.push(self.definition(name, proc));
      }
    });
    return defs.join("\n\n");
  };

  self.copydef = function(newname, oldname) {
    self.routines.set(newname, self.routines.get(oldname));
  };

  function stringify(thing) {
    switch (Type(thing)) {
    case 'list':
      return "[" + thing.map(stringify).join(" ") + "]";
    case 'array':
      return "{" + thing.list.map(stringify).join(" ") + "}" +
        (thing.origin === 1 ? '' : '@' + thing.origin);
    default:
      return sexpr(thing);
    }
  }

  function stringify_nodecorate(thing) {
    switch (Type(thing)) {
    case 'list':
      return thing.map(stringify).join(" ");
    case 'array':
      return thing.list.map(stringify).join(" ");
    default:
      return sexpr(thing);
    }
  }
  
  function def(name, fn, props) {
    fn.minimum = fn.default = fn.maximum = fn.length;
    if (props) {
      Object.keys(props).forEach(function(key) {
        fn[key] = props[key];
      });
    }
    fn.primitive = true;
    if (Array.isArray(name)) {
      name.forEach(function(name) {
        self.routines.set(name, fn);
      });
    } else {
      self.routines.set(name, fn);
    }
  }

  def("to", function(list) {
    var name = sexpr(list.shift());
    if (isNumber(name) || isOperator(name))
      throw err("TO: Expected identifier", ERRORS.BAD_INPUT);

    var inputs = []; 
    var optional_inputs = []; 
    var rest = undefined;
    var length = undefined;
    var block = [];
    
    var REQUIRED = 0, OPTIONAL = 1, REST = 2, DEFAULT = 3, BLOCK = 4;
    var state = REQUIRED, sawEnd = false;
    while (list.length) {
      var atom = list.shift();
      if (isKeyword(atom, 'END')) {
        sawEnd = true;
        break;
      }

      if (state === REQUIRED) {
        if (Type(atom) === 'word' && String(atom).charAt(0) === ':') {
          inputs.push(atom.substring(1));
          continue;
        }
        state = OPTIONAL;
      }

      if (state === OPTIONAL) {
        if (Type(atom) === 'list' && atom.length > 1 &&
            String(atom[0]).charAt(0) === ':') {
          optional_inputs.push([atom.shift().substring(1), atom]);
          continue;
        }
        state = REST;
      }

      if (state === REST) {
        state = DEFAULT;
        if (Type(atom) === 'list' && atom.length === 1 &&
            String(atom[0]).charAt(0) === ':') {
          rest = atom[0].substring(1);
          continue;
        }
      }

      if (state === DEFAULT) {
        state = BLOCK;
        if (Type(atom) === 'word' && isNumber(atom)) {
          length = parseFloat(atom);
          continue;
        }
      }

      block.push(atom);
    }
    if (!sawEnd)
      throw err("TO: Expected END", ERRORS.BAD_INPUT);

    defineProc(name, inputs, optional_inputs, rest, length, block);
  }, {special: true});

  function defineProc(name, inputs, optional_inputs, rest, def, block) {
    if (self.routines.has(name) && self.routines.get(name).primitive)
      throw err("{_PROC_}: Can't redefine primitive {name:U}", { name: name },
                ERRORS.IS_PRIMITIVE);

    if (def !== undefined &&
        (def < inputs.length || (!rest && def > inputs.length + optional_inputs.length))) {
      throw err("{_PROC_}: Bad default number of inputs for {name:U}", {name: name},
               ERRORS.BAD_INPUT);
    }

    var length = (def === undefined) ? inputs.length : def;

    var func = function() {

      var scope = new StringMap(true);
      self.scopes.push(scope);

      var i = 0, op;
      for (; i < inputs.length && i < arguments.length; ++i)
        scope.set(inputs[i], {value: arguments[i]});
      for (; i < inputs.length + optional_inputs.length && i < arguments.length; ++i) {
        op = optional_inputs[i - inputs.length];
        scope.set(op[0], {value: arguments[i]});
      }
      for (; i < inputs.length + optional_inputs.length; ++i) {
        op = optional_inputs[i - inputs.length];
        scope.set(op[0], {value: evaluateExpression(reparse(op[1]))});
      }
      if (rest)
        scope.set(rest, {value: [].slice.call(arguments, i)});

      return promiseFinally(self.execute(block).then(promiseYield, function(err) {
        if (err instanceof Output)
          return err.output;
        throw err;
      }), function() {
        self.scopes.pop();
      });
    };

    var proc = to_arity(func, length);
    self.routines.set(name, proc);

    proc.inputs = inputs;
    proc.optional_inputs = optional_inputs;
    proc.rest = rest;
    proc.def = def;
    proc.block = block;

    proc.minimum = inputs.length;
    proc.default = length;
    proc.maximum = rest ? -1 : inputs.length + optional_inputs.length;

    saveproc(name, self.definition(name, proc));
  }


  def("def", function(list) {

    var name = sexpr(list);
    var proc = this.routines.get(name);
    if (!proc)
      throw err("{_PROC_}: Don't know how to {name:U}", { name: name }, ERRORS.BAD_PROC);
    if (!proc.inputs) {
      throw err("{_PROC_}: Can't show definition of primitive {name:U}", { name: name },
               ERRORS.IS_PRIMITIVE);
    }

    return this.definition(name, proc);
  });

  def("word", function(word1, word2) {
    return arguments.length ?
      Array.from(arguments).map(sexpr).reduce(function(a, b) { return a + b; }) : "";
  }, {minimum: 0, maximum: -1});

  def("list", function(thing1, thing2) {
    return Array.from(arguments).map(function(x) { return x; }); // Make a copy
  }, {minimum: 0, maximum: -1});

  def(["sentence", "se"], function(thing1, thing2) {
    var list = [];
    for (var i = 0; i < arguments.length; ++i) {
      var thing = arguments[i];
      if (Type(thing) === 'list') {
        thing = lexpr(thing);
        list = list.concat(thing);
      } else {
        list.push(thing);
      }
    }
    return list;
  }, {minimum: 0, maximum: -1});

  def("fput", function(thing, list) {
    var l = lexpr(list);
    l.unshift(thing);
    return sifw(list, l);
  });
  
  def("lput", function(thing, list) {
      var l = lexpr(list);
      l.push(thing);
      return sifw(list, l);
    });
  
    def("array", function(size) {
      size = aexpr(size);
      if (size < 1)
        throw err("{_PROC_}: Array size must be positive integer", ERRORS.BAD_INPUT);
      var origin = (arguments.length < 2) ? 1 : aexpr(arguments[1]);
      return new LogoArray(size, origin);
    }, {maximum: 2});
  
    def("mdarray", function(sizes) {
      sizes = lexpr(sizes).map(aexpr).map(function(n) { return n|0; });
      if (sizes.some(function(size) { return size < 1; }))
        throw err("{_PROC_}: Array size must be positive integer", ERRORS.BAD_INPUT);
      var origin = (arguments.length < 2) ? 1 : aexpr(arguments[1]);
  
      function make(index) {
        var n = sizes[index], a = new LogoArray(n, origin);
        if (index + 1 < sizes.length) {
          for (var i = 0; i < n; ++i)
            a.setItem(i + origin, make(index + 1));
        }
        return a;
      }
  
      return make(0);
    }, {maximum: 2});
  
    def("listtoarray", function(list) {
      list = lexpr(list);
      var origin = 1;
      if (arguments.length > 1)
        origin = aexpr(arguments[1]);
      return LogoArray.from(list, origin);
    }, {maximum: 2});
  
    def("arraytolist", function(array) {
      if (Type(array) !== 'array') {
        throw err("{_PROC_}: Expected array", ERRORS.BAD_INPUT);
      }
      return array.list.slice();
    });
  
    def("combine", function(thing1, thing2) {
      if (Type(thing2) !== 'list') {
        return this.routines.get('word')(thing1, thing2);
      } else {
        return this.routines.get('fput')(thing1, thing2);
      }
    });
  
    def("reverse", function(list) {
      var tail = (arguments.length > 1) ? arguments[1] : (Type(list) === 'list' ? [] : '');
      return sifw(tail, lexpr(list).reverse().concat(lexpr(tail)));
    }, {maximum: 2});
  
    this.gensym_index = 0;
    def("gensym", function() {
      ++this.gensym_index;
      return 'G' + this.gensym_index;
    });
  
    def("first", function(list) { return lexpr(list)[0]; });
  
    def("firsts", function(list) {
      return lexpr(list).map(function(x) { return x[0]; });
    });
  
    def("last", function(list) { list = lexpr(list); return list[list.length - 1]; });
  
    def(["butfirst", "bf"], function(list) {
      return sifw(list, lexpr(list).slice(1));
    });
  
    def(["butfirsts", "bfs"], function(list) {
      return lexpr(list).map(function(x) { return sifw(x, lexpr(x).slice(1)); });
    });
  
    def(["butlast", "bl"], function(list) {
      return Type(list) === 'word' ? String(list).slice(0, -1) : lexpr(list).slice(0, -1);
    });
  
    function item(index, thing) {
      switch (Type(thing)) {
      case 'list':
        if (index < 1 || index > thing.length)
          throw err("{_PROC_}: Index out of bounds", ERRORS.BAD_INPUT);
        return thing[index - 1];
      case 'array':
        return thing.item(index);
      default:
        thing = sexpr(thing);
        if (index < 1 || index > thing.length)
          throw err("{_PROC_}: Index out of bounds", ERRORS.BAD_INPUT);
        return thing.charAt(index - 1);
      }
    }
  
    def("item", function(index, thing) {
      index = aexpr(index)|0;
      return item(index, thing);
    });
  
    def("mditem", function(indexes, thing) {
      indexes = lexpr(indexes).map(aexpr).map(function(n) { return n|0; });
      while (indexes.length)
        thing = item(indexes.shift(), thing);
      return thing;
    });
  
    def("pick", function(list) {
      list = lexpr(list);
      var i = Math.floor(this.prng.next() * list.length);
      return list[i];
    });
  
    def("remove", function(thing, list) {
      return sifw(list, lexpr(list).filter(function(x) { return !equal(x, thing); }));
    });
  
    def("remdup", function(list) {

      var set = new Set();
      return sifw(list, lexpr(list).filter(function(x) {
        if (set.has(x)) { return false; } else { set.add(x); return true; }
      }));
    });
    
  def("split", function(thing, list) {
    var l = lexpr(list);
    return lexpr(list)
      .reduce(function(ls, i) {
        return (equal(i, thing) ? ls.push([]) : ls[ls.length - 1].push(i), ls);
      }, [[]])
      .filter(function(l) { return l.length > 0; })
      .map(function(e) { return sifw(list, e); });
  });

  def("quoted", function(thing) {
    if (Type(thing) === 'word')
      return '"' + thing;
    return thing;
  });

  function contains(atom, value) {
    if (atom === value) return true;
    switch (Type(atom)) {
    case 'list':
      return atom.some(function(a) { return contains(a, value); });
    case 'array':
      return atom.list.some(function(a) { return contains(a, value); });
    default:
      return false;
    }
  }

  def("setitem", function(index, array, value) {
    index = aexpr(index);
    if (Type(array) !== 'array')
      throw err("{_PROC_}: Expected array", ERRORS.BAD_INPUT);
    if (contains(value, array))
      throw err("{_PROC_}: Can't create circular array", ERRORS.BAD_INPUT);
    array.setItem(index, value);
  });

  def("mdsetitem", function(indexes, thing, value) {
    indexes = lexpr(indexes).map(aexpr).map(function(n) { return n|0; });
    if (Type(thing) !== 'array')
      throw err("{_PROC_}: Expected array", ERRORS.BAD_INPUT);
    if (contains(value, thing))
      throw err("{_PROC_}: Can't create circular array", ERRORS.BAD_INPUT);
    while (indexes.length > 1) {
      thing = item(indexes.shift(), thing);
      if (Type(thing) !== 'array')
        throw err("{_PROC_}: Expected array", ERRORS.BAD_INPUT);
    }
    thing.setItem(indexes.shift(), value);
  });

  def(".setfirst", function(list, value) {
     if (Type(list) !== 'list')
      throw err("{_PROC_}: Expected list", ERRORS.BAD_INPUT);
    list[0] = value;
  });

  def(".setbf", function(list, value) {
    if (Type(list) !== 'list')
      throw err("{_PROC_}: Expected non-empty list", ERRORS.BAD_INPUT);
    if (list.length < 1)
      throw err("{_PROC_}: Expected non-empty list", ERRORS.BAD_INPUT);
    value = lexpr(value);
    list.length = 1;
    list.push.apply(list, value);
  });

  def(".setitem", function(index, array, value) {
    index = aexpr(index);
    if (Type(array) !== 'array')
      throw err("{_PROC_}: Expected array", ERRORS.BAD_INPUT);
    array.setItem(index, value);
  });

  def("push", function(stackname, thing) {
    var got = getvar(stackname);
    var stack = lexpr(got);
    stack.unshift(thing);
    setvar(stackname, sifw(got, stack));
  });

  def("pop", function(stackname) {
    var got = getvar(stackname);
    var stack = lexpr(got);
    var atom = stack.shift();
    setvar(stackname, sifw(got, stack));
    return atom;
  });

  def("queue", function(stackname, thing) {
    var got = getvar(stackname);
    var queue = lexpr(got);
    queue.push(thing);
    setvar(stackname, sifw(got, queue));
  });

  def("dequeue", function(stackname) {
    var got = getvar(stackname);
    var queue = lexpr(got);
    var atom = queue.pop();
    setvar(stackname, sifw(got, queue));
    return atom;
  });

  def(["wordp", "word?"], function(thing) { return Type(thing) === 'word' ? 1 : 0; });
  def(["listp", "list?"], function(thing) { return Type(thing) === 'list' ? 1 : 0; });
  def(["arrayp", "array?"], function(thing) { return Type(thing) === 'array' ? 1 : 0; });
  def(["numberp", "number?"], function(thing) {
    return Type(thing) === 'word' && isNumber(thing) ? 1 : 0;
  });
  def(["numberwang"], function(thing) { return this.prng.next() < 0.5 ? 1 : 0; });

  def(["equalp", "equal?"], function(a, b) { return equal(a, b) ? 1 : 0; });
  def(["notequalp", "notequal?"], function(a, b) { return !equal(a, b) ? 1 : 0; });

  def(["emptyp", "empty?"], function(thing) {
    switch (Type(thing)) {
    case 'word': return String(thing).length === 0 ? 1 : 0;
    case 'list': return thing.length === 0 ? 1 : 0;
    default: return 0;
    }
  });
  def(["beforep", "before?"], function(word1, word2) {
    return sexpr(word1) < sexpr(word2) ? 1 : 0;
  });

  def(".eq", function(a, b) { return a === b && a && typeof a === 'object'; });

  def(["memberp", "member?"], function(thing, list) {
    return lexpr(list).some(function(x) { return equal(x, thing); }) ? 1 : 0;
  });

  def(["substringp", "substring?"], function(word1, word2) {
    return sexpr(word2).indexOf(sexpr(word1)) !== -1 ? 1 : 0;
  });

  def("count", function(thing) {
    if (Type(thing) === 'array')
      return thing.length;
    return lexpr(thing).length;
  });
  def("ascii", function(chr) { return sexpr(chr).charCodeAt(0); });

  def("char", function(integer) { return String.fromCharCode(aexpr(integer)); });

  def("member", function(thing, input) {
    var list = lexpr(input);
    var index = list.findIndex(function(x) { return equal(x, thing); });
    list = (index === -1) ? [] : list.slice(index);
    return sifw(input, list);
 });

  def("lowercase", function(word) { return sexpr(word).toLowerCase(); });
  def("uppercase", function(word) { return sexpr(word).toUpperCase(); });

  def("standout", function(word) {

    return sexpr(word)
      .split('')
      .map(function(c) {
        var u = c.charCodeAt(0);
        if ('A' <= c && c <= 'Z') {
          u = u - 0x41 + 0x1D400;
        } else if ('a' <= c && c <= 'z') {
          u = u - 0x61 + 0x1D41A;
        } else if ('0' <= c && c <= '9') {
          u = u - 0x30 + 0x1D7CE;
        } else {
          return c;
        }
        var lead = ((u - 0x10000) >> 10) + 0xD800;
        var trail = ((u - 0x10000) & 0x3FF) + 0xDC00;
        return String.fromCharCode(lead, trail);
      })
      .join('');
  });

  def("parse", function(word) {
    return parse('[' + sexpr(word) + ']')[0];
  });

  def("runparse", function(word) {
    return parse(sexpr(word));
  });

  def(["print", "pr"], function(thing) {
    var s = Array.from(arguments).map(stringify_nodecorate).join(" ");
    return this.stream.write(s, "\n");
  }, {minimum: 0, maximum: -1});
  def("type", function(thing) {
    var s = Array.from(arguments).map(stringify_nodecorate).join("");
    return this.stream.write(s);
  }, {minimum: 0, maximum: -1});
  def("show", function(thing) {
    var s = Array.from(arguments).map(stringify).join(" ");
    return this.stream.write(s, "\n");
  }, {minimum: 0, maximum: -1});

  def("readlist", function() {
    return (
      (arguments.length > 0)
        ? stream.read(stringify_nodecorate(arguments[0]))
        : stream.read()
    ).then(function(word) {
      return parse('[' + word + ']')[0];
    });
  }, {maximum: 1});

  def("readword", function() {
    if (arguments.length > 0)
      return stream.read(stringify_nodecorate(arguments[0]));
    else
      return stream.read();
  }, {maximum: 1});

  def(["cleartext", "ct"], function() {
    return this.stream.clear();
  });

  def('settextcolor', function(color) {
    this.stream.color = parseColor(color);
  });

  def('textcolor', function() {
    return this.stream.color;
  });

  def('increasefont', function() {
    this.stream.textsize = Math.round(this.stream.textsize * 1.25);
  });

  def('decreasefont', function() {
    this.stream.textsize = Math.round(this.stream.textsize / 1.25);
  });

  def('settextsize', function(size) {
    this.stream.textsize = aexpr(size);
  });

  def('textsize', function() {
    return this.stream.textsize;
  });

  def('setfont', function(size) {
    this.stream.font = sexpr(size);
  });

  def('font', function() {
    return this.stream.font;
  });
  
  def("sum", function(a, b) {
    return Array.from(arguments).map(aexpr).reduce(function(a, b) { return a + b; }, 0);
  }, {minimum: 0, maximum: -1});

  def("difference", function(a, b) {
    return aexpr(a) - aexpr(b);
  });