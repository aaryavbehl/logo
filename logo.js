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