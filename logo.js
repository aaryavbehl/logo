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