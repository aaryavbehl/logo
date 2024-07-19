var canvas_element = document.getElementById("sandbox"), canvas_ctx;
var turtle_element = document.getElementById("turtle"), turtle_ctx;

QUnit.module("Logo Unit Tests", {
  beforeEach: function(t) {

    canvas_ctx = canvas_ctx || canvas_element.getContext('2d');
    turtle_ctx = turtle_ctx || turtle_element.getContext('2d');

    this.turtle = new CanvasTurtle(
      canvas_ctx,
      turtle_ctx,
      canvas_element.width, canvas_element.height);

    this.stream = {
      inputbuffer: "",

      read: function(prompt) {
        this.last_prompt = prompt;
        var res = this.inputbuffer;
        this.inputbuffer = "";
        return Promise.resolve(res);
      },

      outputbuffer: "",

      write: function() {
        for (var i = 0; i < arguments.length; i += 1) {
          this.outputbuffer += arguments[i];
        }
      },

      clear: function() {
        this.outputbuffer = "";
        this.last_prompt = undefined;
      },

      _font: 'monospace',
      get font() { return this._font; },
      set font(v) { this._font = v; },

      _color: 'black',
      get color() { return this._color; },
      set color(v) { this._color = v; },

      _size: 13,
      get size() { return this._size; },
      set size(v) { this._size = v; }
    };
    
    this.interpreter = new LogoInterpreter(this.turtle, this.stream);

    var EPSILON = 1e-12;

    this.assert_equals = function(expression, expected) {
      var actual = this.interpreter.run(expression, {returnResult: true});
      var done = t.async();
      actual.then(function (result) {
        if (typeof expected === 'object') {
          t.deepEqual(result, expected, expression);
        } else if (typeof expected === 'number' && typeof result === 'number' &&
                   (Math.floor(expected) != expected || Math.floor(result) != result)) {
          t.pushResult({
            result: Math.abs(result - expected) < EPSILON,
            actual: result,
            expected: expected,
            message: expression});
        } else {
          t.strictEqual(result, expected, expression);
        }
      }, function (failure) {
        t.strictEqual(failure, expected, expression);
      }).then(done);
    };

    this.assert_pixel = function(expression, x, y, rgba) {
      return this.assert_pixels(expression, [[x, y, rgba]]);
    };

    this.assert_pixels = function(expression, pixels) {
      var actual = this.interpreter.run(expression);
      var done = t.async();
      actual.then(function(result) {
        pixels.forEach(function(px) {
          var x = px[0]|0, y = px[1]|0, rgba = px[2];
          var pix = canvas_ctx.getImageData(x, y, 1, 1).data;
          t.deepEqual([pix[0], pix[1], pix[2], pix[3]], rgba,
                      expression + ': Pixel data at ' + x + ',' + y);
        });
      }, function(failure) {
        t.pushResult({
          result: false,
          actual: failure,
          expected: '(no error)',
          message: expression});
      }).then(done);
    };

    this.assert_stream = function(expression, expected) {
        this.stream.clear();
        var result = this.interpreter.run(expression, {returnResult: true});
        result = Promise.resolve(result);
        var done = t.async();
        result.then((function () {
          var actual = this.stream.outputbuffer;
          this.stream.clear();
          t.equal(actual, expected, expression);
        }).bind(this), (function (err) {
          var actual = this.stream.outputbuffer + "\nError: " + err;
          this.stream.clear();
          t.equal(actual, expected, expression);
        }).bind(this)).then(done);
      };
  
      this.assert_prompt = function(expression, expected) {
        this.stream.clear();
        var result = this.interpreter.run(expression, {returnResult: true});
        var done = t.async();
        result.then((function () {
          var actual = this.stream.last_prompt;
          this.stream.clear();
          t.equal(actual, expected, expression);
        }).bind(this), (function (err) {
          t.equal("(no error)", err, expression);
          this.stream.clear();
        }).bind(this)).then(done);
      };
  
      this.assert_predicate = function(expression, predicate) {
        var result = this.interpreter.run(expression, {returnResult: true});
        var done = t.async();
        result.then(function (value) {
          t.ok(predicate(value), expression);
        }, function (err) {
          t.equal("(no error)", err, expression);
        }).then(done);
      };
  
      this.assert_error = function(expression, expected, code) {
        var done = t.async();
        try {
          var result = this.interpreter.run(expression);
          result.then(function (result) {
            t.pushResult({
              result:false,
              actual: '(no error)',
              expected: expected,
              message:'Expected to error but did not: ' + expression});
            done();
          }, function (ex) {
            t.pushResult({
              result: ex.message === expected,
              actual: ex.message,
              expected: expected,
              message: 'Expected error from: ' + expression});
            if (code !== undefined) {
              t.pushResult({
                result: ex.code === code,
                actual: ex.code,
                expected: code,
                message: 'Expected error from: ' + expression});
            }
            done();
          });
        } catch (ex) {
          t.push({
            result: ex.message === expected,
            actual: ex.message,
            expected: expected,
            message: 'Expected error from: ' + expression});
          done();
        }
      };
  
      this.queue = function(task) {
        this.interpreter.queueTask(task.bind(this));
      };
  
      this.run = function(code) {
        this.interpreter.run(code).catch(function(error) {
          console.warn(error.message);
          t.pushResult({
            result: false,
            actual: 'Failed: ' + error.message,
            expected: '(no error)',
            message: code
          });
        });
      };
    }
  });
  
  QUnit.test("Parser", function(t) {
  
    this.assert_equals('"abc;comment', 'abc');
    this.assert_equals('"abc;comment\n', 'abc');
    this.assert_equals('"abc ; comment', 'abc');
    this.assert_equals('"abc ; comment\n', 'abc');
  
    this.assert_equals('"abc\\;comment', 'abc;comment');
    this.assert_equals('"abc\\;comment\n', 'abc;comment');

    this.assert_equals('"abc~', 'abc~');
    this.assert_equals('"abc\n"def', 'def');
    this.assert_equals('"abc~\n', 'abc');
    this.assert_equals('"abc~\ndef', 'abcdef');
    this.assert_equals('"abc~\n~\ndef', 'abcdef');
    this.assert_equals('"abc~\nd~\nef', 'abcdef');
    this.assert_equals('"abc\\~\n', 'abc~');
    this.assert_equals('"abc\\~\n"def', 'def');
  
    this.assert_equals('"abc;comment\n"def', 'def');
    this.assert_equals('"abc;comment~\ndef', 'abcdef');
    this.assert_equals('"abc;comment~\n~\ndef', 'abcdef');
    this.assert_equals('"abc;comment~\nde~\nf', 'abcdef');
    this.assert_equals('"abc;comment\\~\n', 'abc');
    this.assert_equals('"abc;comment\\~\n"def', 'def');
    
    this.assert_equals('count [\\]]', 1);
    this.assert_equals('count [[][]]', 2);
    this.assert_equals('count [[]{}[]]', 3);
    this.assert_equals('count [\\[\\]\\{\\}\\[\\]]', 1);
    this.assert_equals('count [ \\[ \\] \\{ \\} \\[ \\]]', 6);
    this.assert_equals('count [   ]', 0);
    this.assert_equals('count [ \\  ]', 1);
    this.assert_equals('count [ \\ \\  ]', 1);
    this.assert_equals('count [ \\  \\  ]', 2);
    
    this.assert_equals('count [ abc;com ment\ndef  ]', 2);
    this.assert_equals('count [ abc;com ment~\ndef  ]', 1);
    this.assert_equals('count [ abc;com ment\\~\ndef  ]', 2);
    
    this.assert_equals('"test', 'test');
    
    this.assert_equals('1', 1);
    this.assert_equals('[ a b c ]', ["a", "b", "c"]);
    this.assert_equals('[ 1 2 3 ]', ["1", "2", "3"]);
    this.assert_equals('[ 1 -2 3 ]', ["1", "-2", "3"]);
    this.assert_equals('[ 1-2 3 ]', ["1-2", "3"]);
    this.assert_equals('[ 1 2 [ 3 ] 4 *5 ]', ["1", "2", [ "3" ], "4", "*5"]);
    
    this.assert_equals('-4', -4); 
    this.assert_equals('- 4 + 10', 6); 
    this.assert_equals('10 + - 4', 6); 
    this.assert_equals('(-4)', -4); 
    this.assert_equals('make "t 10 -4 :t', 10); 
    this.assert_equals('make "t 10 - 4 :t', 6); 
    this.assert_equals('make "t 10-4 :t', 6); 
    this.assert_equals('make "t 10- 4 :t', 6); 
    this.assert_equals('sum 10 -4', 6); 
    this.assert_error('sum 10 - 4', 'Unexpected end of instructions'); 
    this.assert_equals('sum 10 (-4)', 6); 
    this.assert_equals('sum 10 ( -4 )', 6); 
    this.assert_equals('sum 10 ( - 4 )', 6); 
    this.assert_equals('sum 10 (- 4)', 6); 
  
      this.assert_equals('make "t 1 :t', 1);
      this.assert_equals('MAKE "t 1 :t', 1);
      this.assert_equals('MaKe "t 1 :t', 1);
    
      this.assert_equals('make "t 2 :t', 2);
      this.assert_equals('make "T 3 :t', 3);
      this.assert_equals('make "t 4 :T', 4);
      this.assert_equals('make "T 5 :T', 5);
    
      this.assert_equals('to foo output 6 end  foo', 6);
      this.assert_equals('to FOO output 7 end  foo', 7);
      this.assert_equals('to foo output 8 end  FOO', 8);
      this.assert_equals('to FOO output 9 end  FOO', 9);

      this.assert_stream('print [ Hello World ]', 'Hello World\n');
    
      this.assert_stream('type .2 + .3', '0.5');
      this.assert_equals('1e2', 100);
      this.assert_equals('1e+2', 100);
      this.assert_equals('1e-2', 0.01);
      this.assert_equals('-1', -1);

      this.assert_equals('count { a b c }', 3);
      this.assert_equals('count { a b c }@0', 3);
      this.assert_equals('count { a b c }@123', 3);
      this.assert_equals('count { a b c } @ 0', 3);
      this.assert_error('make "a count { 1 2 3 }@1.5', "Don't know what to do with 0.5", 9);
      this.assert_equals('item 0 { 1 2 3 }@', '1');
    
      this.assert_equals('item 1 { 1 2 3 }@1', '1');
      this.assert_equals('item 2 { 1 2 3 }@1', '2');
      this.assert_equals('item 3 { 1 2 3 }@1', '3');
    
      this.assert_equals('item 2 { 1 2 3 }@2', '1');
      this.assert_equals('item 3 { 1 2 3 }@2', '2');
      this.assert_equals('item 4 { 1 2 3 }@2', '3');
    
      this.assert_equals('item -1 { 1 2 3 }@-1', '1');
      this.assert_equals('item 0 { 1 2 3 }@-1', '2');
    
      this.assert_equals('count [ a b [ c d e ] f ]', 4);
      this.assert_equals('count { a b { c d e } f }', 4);
      this.assert_equals('count { a b [ c d e ] f }', 4);
      this.assert_equals('count [ a b { c d e } f ]', 4);
    
    
      this.assert_error('show ]', "Unexpected ']'");
      this.assert_error('show }', "Unexpected '}'");
      this.assert_error('show )', "Unexpected ')'");
    });
    
    QUnit.test("Data Structure Primitives", function(t) {

      this.assert_equals('word "hello "world', 'helloworld');
      this.assert_equals('(word "a "b "c)', 'abc');
      this.assert_equals('(word)', '');
    
      this.assert_equals('list 1 2', [1, 2]);
      this.assert_equals('(list 1 2 3)', [1, 2, 3]);
    
      this.assert_stream('show array 2', '{[] []}\n');
      this.assert_stream('make "a (array 5 0) ' +
                         'repeat 5 [ setitem repcount-1 :a repcount*repcount ] ' +
                         'show :a', '{1 4 9 16 25}@0\n');
      this.assert_stream('make "a { 1 2 3 } ' +
                         'show :a', '{1 2 3}\n');
      this.assert_stream('make "a { 1 2 3 } @ 10' +
                         'show :a', '{1 2 3}@10\n');
    
      this.assert_stream('show mdarray [2 2]', '{{[] []} {[] []}}\n');
      this.assert_stream('show mdarray [2 2 2]', '{{{[] []} {[] []}} {{[] []} {[] []}}}\n');
      this.assert_stream('show (mdarray [2 2] 0)', '{{[] []}@0 {[] []}@0}@0\n');
      this.assert_error('mdarray [1 2 0]', 'MDARRAY: Array size must be positive integer');
    
      this.assert_stream('show (listtoarray [ 1 2 3 ])', '{1 2 3}\n');
      this.assert_stream('show (listtoarray [ 1 2 3 ] 0)', '{1 2 3}@0\n');
    
      this.assert_equals('arraytolist {1 2 3}', ['1', '2', '3']);
      this.assert_equals('arraytolist {1 2 3}@0', ['1', '2', '3']);
    
      this.assert_equals('sentence 1 2', [1, 2]);
      this.assert_equals('se 1 2', [1, 2]);
      this.assert_equals('(sentence 1)', [1]);
      this.assert_equals('(sentence 1 2 3)', [1, 2, 3]);
      this.assert_equals('sentence [a] [b]', ["a", "b"]);
      this.assert_equals('sentence [a b] [c d]', ["a", "b", "c", "d"]);
      this.assert_equals('sentence 1 [2 3]', [1, "2", "3"]);
    
      this.assert_equals('fput 0 ( list 1 2 3 )', [0, 1, 2, 3]);
      this.assert_equals('fput "x "abc', 'xabc');
    
      this.assert_equals('lput 0 ( list 1 2 3 )', [1, 2, 3, 0]);
      this.assert_equals('lput "x "abc', 'abcx');
    
      this.assert_equals('combine "a "b', 'ab');
      this.assert_equals('combine "a [b]', ["a", "b"]);
    
      this.assert_equals('reverse [ a b c ]', ["c", "b", "a"]);
      this.assert_equals('reverse "abc', 'cba');
      this.assert_equals('(reverse [ a b c ] [ d e ])', ['c', 'b', 'a', 'd', 'e']);
      this.assert_equals('(reverse "abc "de)', 'cbade');
      this.assert_equals('(reverse "abc [ d e ])', ['c', 'b', 'a', 'd', 'e']);
      this.assert_equals('(reverse [ a b c ] "de)', 'cbade');
    
      this.assert_equals('gensym <> gensym', 1);
      
  this.assert_equals('first (list 1 2 3 )', 1);
  this.assert_equals('firsts [ [ 1 2 3 ] [ "a "b "c] ]', ["1", '"a']);
  this.assert_equals('last [ a b c ]', "c");
  this.assert_equals('butfirst [ a b c ]', ["b", "c"]);
  this.assert_equals('butfirst "abc', 'bc');
  this.assert_equals('bf [ a b c ]', ["b", "c"]);
  this.assert_equals('butfirsts [ [ 1 2 3 ] [ "a "b "c] ]', [["2", "3"], ['"b', '"c']]);
  this.assert_equals('butfirsts [ 123 abc ]', ['23', 'bc']);
  this.assert_equals('bfs [ [ 1 2 3 ] [ "a "b "c] ]', [["2", "3"], ['"b', '"c']]);
  this.assert_equals('butlast  [ a b c ]', ["a", "b"]);
  this.assert_equals('bl [ a b c ]', ["a", "b"]);

  this.assert_equals('first "123', '1');
  this.assert_equals('last  "123', '3');
  this.assert_equals('first "abc', 'a');
  this.assert_equals('last  "abc', 'c');
  this.assert_equals('butfirst "123', '23');
  this.assert_equals('butlast  "123', '12');

  this.assert_equals('first 123', '1');
  this.assert_equals('last  123', '3');
  this.assert_equals('butfirst 123', '23');
  this.assert_equals('butlast  123', '12');

  this.assert_error('item 0 [ a b c ]', 'ITEM: Index out of bounds');
  this.assert_equals('item 1 [ a b c ]', "a");
  this.assert_equals('item 2 [ a b c ]', "b");
  this.assert_equals('item 3 [ a b c ]', "c");
  this.assert_error('item 4 [ a b c ]', 'ITEM: Index out of bounds');

  this.assert_error('item 0 { a b c }', 'ITEM: Index out of bounds');
  this.assert_equals('item 1 { a b c }', "a");
  this.assert_equals('item 2 { a b c }', "b");
  this.assert_equals('item 3 { a b c }', "c");
  this.assert_error('item 4 { a b c }', 'ITEM: Index out of bounds');

  this.assert_equals('item 0 { a b c }@0', 'a');
  this.assert_equals('item 1 { a b c }@0', 'b');
  this.assert_equals('item 2 { a b c }@0', 'c');
  this.assert_error('item 3 { a b c }@0', 'ITEM: Index out of bounds');

  this.assert_error('item 0 "abc', 'ITEM: Index out of bounds');
  this.assert_equals('item 1 "abc', "a");
  this.assert_equals('item 2 "abc', "b");
  this.assert_equals('item 3 "abc', "c");
  this.assert_error('item 4 "abc', 'ITEM: Index out of bounds');

  this.assert_error('item 0 456', 'ITEM: Index out of bounds');
  this.assert_equals('item 1 456', "4");
  this.assert_equals('item 2 456', "5");
  this.assert_equals('item 3 456', "6");
  this.assert_error('item 4 456', 'ITEM: Index out of bounds');

  this.assert_stream('make "a { a b c } ' +
                     'setitem 2 :a "q ' +
                     'show :a', '{a q c}\n');
  this.assert_stream('make "a { a b c }@0 ' +
                     'setitem 2 :a "q ' +
                     'show :a', '{a b q}@0\n');


  this.assert_error('mditem [0 1] mdarray [1 1]', 'MDITEM: Index out of bounds');
  this.assert_error('mditem [1 2] mdarray [1 1]', 'MDITEM: Index out of bounds');
  this.assert_equals('mditem [1 1] mdarray [1 1]', []);
  this.assert_equals('mditem [0 0] (mdarray [1 1] 0)', []);
  this.assert_stream('show mditem [1] mdarray [1 1]', '{[]}\n');
  this.assert_stream('make "a mdarray [ 2 2 ] ' +
                     'mdsetitem [1 1] :a 1 ' +
                     'mdsetitem [1 2] :a 2 ' +
                     'mdsetitem [2 1] :a 3 ' +
                     'mdsetitem [2 2] :a 4 ' +
                     'show :a', '{{1 2} {3 4}}\n');

  for (var i = 0; i < 10; i += 1) {
    this.assert_predicate('pick [ 1 2 3 4 ]', function(x) { return 1 <= x && x <= 4; });
  }
  this.assert_equals('remove "b [ a b c ]', ["a", "c"]);
  this.assert_equals('remove "d [ a b c ]', ["a", "b", "c"]);
  this.assert_equals('remove "b "abc', 'ac');

  this.assert_equals('remdup [ a b c a b c ]', ["a", "b", "c"]);
  this.assert_equals('remdup "abcabc', 'abc');

  this.assert_equals('quoted "abc', '"abc');
  this.assert_equals('quoted [ a b c ]', ['a', 'b', 'c']);

  this.assert_equals('split "a "banana', ['b', 'n', 'n']);
  this.assert_equals('split "a "alphabetical', ['lph', 'betic', 'l']);
  this.assert_equals('split 1 [1 2 3 4 1 2 3 4 1 2 3 4 ]', [['2', '3', '4'], ['2', '3', '4'], ['2', '3', '4']]);
  this.assert_equals('split 2 [1 2 3 4 1 2 3 4 1 2 3 4 ]', [['1'], ['3', '4', '1'], ['3', '4', '1'], ['3', '4']]);
  this.assert_equals('split 3 [1 2 3 4 1 2 3 4 1 2 3 4 ]', [['1', '2'], ['4', '1', '2'], ['4', '1', '2'], ['4']]);
  this.assert_equals('split 4 [1 2 3 4 1 2 3 4 1 2 3 4 ]', [['1', '2', '3'], ['1', '2', '3'], ['1', '2', '3']]);

  this.assert_equals('make "s [] repeat 5 [ push "s repcount ] :s', [5, 4, 3, 2, 1]);
  this.assert_equals('make "s "0 repeat 5 [ push "s repcount ] :s', '543210');

  this.assert_equals('make "s [ a b c ] (list pop "s pop "s pop "s)', ["a", "b", "c"]);
  this.assert_equals('make "s [ a b c ] pop "s pop "s  :s', ["c"]);
  this.assert_equals('make "s "abc (list pop "s pop "s pop "s)', ["a", "b", "c"]);
  this.assert_equals('make "s "abc  pop "s  :s', 'bc');

  this.assert_equals('make "q [] repeat 5 [ queue "q repcount ] :q', [1, 2, 3, 4, 5]);
  this.assert_equals('make "q "0 repeat 5 [ queue "q repcount ] :q', '012345');

  this.assert_equals('make "q [ a b c ] (list dequeue "q dequeue "q dequeue "q)', ["c", "b", "a"]);
  this.assert_equals('make "q [ a b c ]  dequeue "q  dequeue "q  :q', ["a"]);
  this.assert_equals('make "q "abc  (list dequeue "q dequeue "q dequeue "q)', ["c", "b", "a"]);
  this.assert_equals('make "q "abc  dequeue "q  :q', "ab");

  this.assert_equals('make "a { 1 }  make "b :a  setitem 1 :a 2  item 1 :b', 2);
  this.assert_error('make "a { 1 }  setitem 1 :a :a', "SETITEM: Can't create circular array");
  this.assert_error('make "a { 1 }  make "b { 1 }  setitem 1 :b :a  setitem 1 :a :b', "SETITEM: Can't create circular array");
  this.assert_error('setitem 1 "x 123', 'SETITEM: Expected array');

  this.assert_equals('make "a mdarray [1 1]  make "b :a  mdsetitem [1 1] :a 2  mditem [1 1] :b', 2);
  this.assert_error('make "a mdarray [1 1]  mdsetitem [1 1] :a :a', "MDSETITEM: Can't create circular array");
  this.assert_error('mdsetitem [1 1] "x 0', "MDSETITEM: Expected array");
  this.assert_error('mdsetitem [1 1] {"x} 0', "MDSETITEM: Expected array");

  this.assert_equals('make "a []  .setfirst :a "s  :a', ['s']);
  this.assert_error('.setfirst "x "y', '.SETFIRST: Expected list');

  this.assert_equals('make "a [a]  .setbf :a [b c]  :a', ['a', 'b', 'c']);
  this.assert_error('.setbf "x [1]', '.SETBF: Expected non-empty list');
  this.assert_error('.setbf [] [1]', '.SETBF: Expected non-empty list');

  this.assert_equals('make "a { 1 }  make "b :a  .setitem 1 :a 2  item 1 :b', 2);
  this.assert_equals('make "a { 1 }  .setitem 1 :a :a  equalp item 1 :a :a', 1);
  this.assert_error('.setitem 1 "x 123', '.SETITEM: Expected array');

  this.assert_equals('wordp "a', 1);
  this.assert_equals('wordp 1', 1);
  this.assert_equals('wordp [ 1 ]', 0);
  this.assert_equals('wordp { 1 }', 0);
  this.assert_equals('word? "a', 1);
  this.assert_equals('word? 1', 1);
  this.assert_equals('word? [ 1 ]', 0);
  this.assert_equals('word? { 1 }', 0);

  this.assert_equals('listp "a', 0);
  this.assert_equals('listp 1', 0);
  this.assert_equals('listp [ 1 ]', 1);
  this.assert_equals('listp { 1 }', 0);
  this.assert_equals('list? "a', 0);
  this.assert_equals('list? 1', 0);
  this.assert_equals('list? [ 1 ]', 1);
  this.assert_equals('list? { 1 }', 0);

  this.assert_equals('arrayp "a', 0);
  this.assert_equals('arrayp 1', 0);
  this.assert_equals('arrayp [ 1 ]', 0);
  this.assert_equals('arrayp { 1 }', 1);
  this.assert_equals('array? "a', 0);
  this.assert_equals('array? 1', 0);
  this.assert_equals('array? [ 1 ]', 0);
  this.assert_equals('array? { 1 }', 1);
  
    this.assert_equals('equalp 3 4', 0);
    this.assert_equals('equalp 3 3', 1);
    this.assert_equals('equalp 3 2', 0);
    this.assert_equals('equal? 3 4', 0);
    this.assert_equals('equal? 3 3', 1);
    this.assert_equals('equal? 3 2', 0);
    this.assert_equals('3 = 4', 0);
    this.assert_equals('3 = 3', 1);
    this.assert_equals('3 = 2', 0);
    this.assert_equals('notequalp 3 4', 1);
    this.assert_equals('notequalp 3 3', 0);
    this.assert_equals('notequalp 3 2', 1);
    this.assert_equals('notequal? 3 4', 1);
    this.assert_equals('notequal? 3 3', 0);
    this.assert_equals('notequal? 3 2', 1);
    this.assert_equals('3 <> 4', 1);
    this.assert_equals('3 <> 3', 0);
    this.assert_equals('3 <> 2', 1);
    this.assert_equals('[] = []', 1);
    this.assert_equals('[] <> [ 1 ]', 1);
  
    this.assert_equals('equalp "a "a', 1);
    this.assert_equals('equalp "a "b', 0);
    this.assert_equals('"a = "a', 1);
    this.assert_equals('"a = "b', 0);
    this.assert_equals('equalp [1 2] [1 2]', 1);
    this.assert_equals('equalp [1 2] [1 3]', 0);
    this.assert_equals('[ 1 2 ] = [ 1 2 ]', 1);
    this.assert_equals('[ 1 2 ] = [ 1 3 ]', 0);
  
    this.assert_equals('equalp {1} {1}', 0);
    this.assert_equals('make "a {1}  equalp :a :a', 1);
    this.assert_equals('{1} = {1}', 0);
    this.assert_equals('make "a {1}  :a = :a', 1);
  
    this.assert_equals('equalp "a 1', 0);
    this.assert_equals('equalp "a [ 1 ]', 0);
    this.assert_equals('equalp 1 [ 1 ]', 0);
  
  
    this.assert_equals('numberp "a', 0);
    this.assert_equals('numberp 1', 1);
    this.assert_equals('numberp [ 1 ]', 0);
    this.assert_equals('numberp { 1 }', 0);
    this.assert_equals('number? "a', 0);
    this.assert_equals('number? 1', 1);
    this.assert_equals('number? [ 1 ]', 0);
    this.assert_equals('number? { 1 }', 0);
  
    this.assert_equals('emptyp []', 1);
    this.assert_equals('empty? []', 1);
    this.assert_equals('emptyp [ 1 ]', 0);
    this.assert_equals('empty? [ 1 ]', 0);
    this.assert_equals('emptyp "', 1);
    this.assert_equals('empty? "', 1);
    this.assert_equals('emptyp "a', 0);
    this.assert_equals('empty? "a', 0);
  
    this.assert_equals('emptyp {}', 0);
  
    this.assert_equals('beforep "a "b', 1);
    this.assert_equals('beforep "b "b', 0);
    this.assert_equals('beforep "c "b', 0);
    this.assert_equals('before? "a "b', 1);
    this.assert_equals('before? "b "b', 0);
    this.assert_equals('before? "c "b', 0);
  
    this.assert_equals('.eq 1 1', false);
    this.assert_equals('.eq 1 "1', false);
    this.assert_equals('.eq [] []', false);
    this.assert_equals('.eq {} {}', false);
    this.assert_equals('make "a 1  .eq :a :a', false);
    this.assert_equals('make "a []  .eq :a :a', true);
    this.assert_equals('make "a {}  .eq :a :a', true);
  
    this.assert_equals('memberp "b [ a b c ]', 1);
    this.assert_equals('memberp "e [ a b c ]', 0);
    this.assert_equals('memberp [ "b ] [ [ "a ] [ "b ] [ "c ] ]', 1);
    this.assert_equals('member? "b [ a b c ]', 1);
    this.assert_equals('member? "e [ a b c ]', 0);
    this.assert_equals('member? [ "b ] [ [ "a ] [ "b ] [ "c ] ]', 1);
  
    this.assert_equals('substringp "a "abc', 1);
    this.assert_equals('substringp "z "abc', 0);
    this.assert_equals('substring? "a "abc', 1);
    this.assert_equals('substring? "z "abc', 0);
  
    this.assert_equals('count [ ]', 0);
    this.assert_equals('count [ 1 ]', 1);
    this.assert_equals('count [ 1 2 ]', 2);
    this.assert_equals('count { 1 2 }@0', 2);
    this.assert_equals('count "', 0);
    this.assert_equals('count "a', 1);
    this.assert_equals('count "ab', 2);
  
    this.assert_equals('ascii "A', 65);
    this.assert_equals('char 65', 'A');
  
    this.assert_equals('member "a "banana', 'anana');
    this.assert_equals('member "z "banana', '');
    this.assert_equals('member 1 [1 2 3 1 2 3]', ['1', '2', '3', '1', '2', '3']);
    this.assert_equals('member 2 [1 2 3 1 2 3]', ['2', '3', '1', '2', '3']);
    this.assert_equals('member 3 [1 2 3 1 2 3]', ['3', '1', '2', '3']);
    this.assert_equals('member 4 [1 2 3 1 2 3]', []);
  
    this.assert_equals('lowercase "ABcd', 'abcd');
    this.assert_equals('uppercase "ABcd', 'ABCD');
  
    this.assert_equals('standout "whatever', '\uD835\uDC30\uD835\uDC21\uD835\uDC1A\uD835\uDC2D\uD835\uDC1E\uD835\uDC2F\uD835\uDC1E\uD835\uDC2B');
    this.assert_equals('standout "ABCabc123', '\uD835\uDC00\uD835\uDC01\uD835\uDC02\uD835\uDC1A\uD835\uDC1B\uD835\uDC1C\uD835\uDFCF\uD835\uDFD0\uD835\uDFD1');
    this.assert_equals('standout "!@#$_,.?', '!@#$_,.?');
  
    this.assert_equals('parse "1+\\(2\\ *\\ 3\\)', ['1+(2', '*', '3)']);
    this.assert_equals('runparse "1+\\(2\\ *\\ 3\\)', ['1', '+', '(', '2', '*', '3', ')']);
  
  });
  
  QUnit.test("Communication", function(t) {
    t.expect(33);

    this.assert_stream('print "a', 'a\n');
    this.assert_stream('print 1', '1\n');
    this.assert_stream('print [ 1 ]', '1\n');
    this.assert_stream('print [ 1 [ 2 ] ]', '1 [2]\n');
    this.assert_stream('(print "a 1 [ 2 [ 3 ] ])', 'a 1 2 [3]\n');
  
    this.assert_stream('type "a', 'a');
    this.assert_stream('(type "a 1 [ 2 [ 3 ] ])', 'a12 [3]');
  
    this.assert_stream('(print "hello "world)', "hello world\n");
    this.assert_stream('(type "hello "world)', "helloworld");
  
    this.assert_stream('show "a', 'a\n');
    this.assert_stream('show 1', '1\n');
    this.assert_stream('show [ 1 ]', '[1]\n');
    this.assert_stream('show [ 1 [ 2 ] ]', '[1 [2]]\n');
    this.assert_stream('(show "a 1 [ 2 [ 3 ] ])', 'a 1 [2 [3]]\n');

    this.queue(function() { this.stream.inputbuffer = "1+2"; });
    this.assert_equals('readlist', ['1+2']);
    this.queue(function() { this.stream.inputbuffer = "1 + 2"; });
    this.assert_equals('readlist', ['1', '+', '2']);
    this.assert_prompt('readlist', undefined);
    this.assert_prompt('(readlist "query)', 'query');
    this.assert_prompt('(readlist [a b c])', 'a b c');
  
    this.queue(function() { this.stream.inputbuffer = "test"; });
    this.assert_equals('readword', 'test');
    this.queue(function() { this.stream.inputbuffer = "a b c 1 2 3"; });
    this.assert_equals('readword', 'a b c 1 2 3');
    this.assert_prompt('readword', undefined);
    this.assert_prompt('(readword "query)', 'query');
    this.assert_prompt('(readword [a b c])', 'a b c');
    
  this.assert_stream('print "a cleartext', '');
  this.assert_stream('print "a ct', '');

  this.assert_equals('settextcolor "red  textcolor', 'red');
  this.assert_equals('settextcolor "#123456  textcolor', '#123456');
  this.assert_equals('settextcolor [ 0 100 0 ]  textcolor', '#00ff00');

  this.assert_equals('setfont "serif  font', 'serif');
  this.assert_equals('settextsize 66  textsize', 66);
  this.assert_equals('settextsize 100  increasefont  textsize', 125);
  this.assert_equals('settextsize 100  decreasefont  textsize', 80);

  this.stream.clear();
});

QUnit.test("Arithmetic", function(t) {
  t.expect(147);

  this.assert_equals('sum 1 2', 3);
  this.assert_equals('(sum 1 2 3 4)', 10);
  this.assert_equals('1 + 2', 3);

  this.assert_equals('"3 + "2', 5);

  this.assert_equals('difference 3 1', 2);
  this.assert_equals('3 - 1', 2);
  this.assert_equals('minus 3 + 4', -(3 + 4));
  this.assert_equals('- 3 + 4', (-3) + 4);
  this.assert_equals('minus 3', -3);
  this.assert_equals('- 3', -3);
  this.assert_equals('product 2 3', 6);
  this.assert_equals('(product 2 3 4)', 24);
  this.assert_equals('2 * 3', 6);
  this.assert_equals('quotient 6 2', 3);
  this.assert_equals('(quotient 2)', 1 / 2);
  this.assert_equals('6 / 2', 3);

  this.assert_equals('remainder 7 4', 3);
  this.assert_equals('remainder 7 -4', 3);
  this.assert_equals('remainder -7 4', -3);
  this.assert_equals('remainder -7 -4', -3);
  this.assert_equals('7 % 4', 3);
  this.assert_equals('7 % -4', 3);
  this.assert_equals('-7 % 4', -3);
  this.assert_equals('-7 % -4', -3);

  this.assert_equals('modulo 7 4', 3);
  this.assert_equals('modulo 7 -4', -3);
  this.assert_equals('modulo -7 4', 3);
  this.assert_equals('modulo -7 -4', -3);

  this.assert_equals('abs -1', 1);
  this.assert_equals('abs 0', 0);
  this.assert_equals('abs 1', 1);

  this.assert_equals('int 3.5', 3);
  this.assert_equals('int -3.5', -3);
  this.assert_equals('round 2.4', 2);
  this.assert_equals('round 2.5', 3);
  this.assert_equals('round 2.6', 3);
  this.assert_equals('round -2.4', -2);
  this.assert_equals('round -2.5', -2);
  this.assert_equals('round -2.6', -3);

  this.assert_equals('sqrt 9', 3);
  this.assert_equals('power 3 2', 9);
  this.assert_equals('3 ^ 2', 9);

  this.assert_equals('exp 2', 7.38905609893065);
  this.assert_equals('log10 100', 2);
  this.assert_equals('ln 9', 2.1972245773362196);

  this.assert_equals('arctan 1', 45);
  this.assert_equals('2*(arctan 0 1)', 180);
  this.assert_equals('sin 30', 0.5);
  this.assert_equals('cos 60', 0.5);
  this.assert_equals('tan 45', 1);

  this.assert_equals('radarctan 1', Math.PI / 4);
  this.assert_equals('2*(radarctan 0 1)', Math.PI);
  this.assert_equals('radsin 0.5235987755982988', 0.5);
  this.assert_equals('radcos 1.0471975511965976', 0.5);
  this.assert_equals('radtan 0.7853981633974483', 1);

  this.assert_equals('iseq 1 4', [1, 2, 3, 4]);
  this.assert_equals('iseq 3 7', [3, 4, 5, 6, 7]);
  this.assert_equals('iseq 7 3', [7, 6, 5, 4, 3]);

  this.assert_equals('rseq 3 5 9', [3, 3.25, 3.5, 3.75, 4, 4.25, 4.5, 4.75, 5]);
  this.assert_equals('rseq 3 5 5', [3, 3.5, 4, 4.5, 5]);

  this.assert_equals('greaterp 3 4', 0);
  this.assert_equals('greaterp 3 3', 0);
  this.assert_equals('greaterp 3 2', 1);
  this.assert_equals('greater? 3 4', 0);
  this.assert_equals('greater? 3 3', 0);
  this.assert_equals('greater? 3 2', 1);
  this.assert_equals('3 > 4', 0);
  this.assert_equals('3 > 3', 0);
  this.assert_equals('3 > 2', 1);
  this.assert_equals('greaterequalp 3 4', 0);
  this.assert_equals('greaterequalp 3 3', 1);
  this.assert_equals('greaterequalp 3 2', 1);
  this.assert_equals('greaterequal? 3 4', 0);
  this.assert_equals('greaterequal? 3 3', 1);
  this.assert_equals('greaterequal? 3 2', 1);
  this.assert_equals('3 >= 4', 0);
  this.assert_equals('3 >= 3', 1);
  this.assert_equals('3 >= 2', 1);
  this.assert_equals('lessp 3 4', 1);
  this.assert_equals('lessp 3 3', 0);
  this.assert_equals('lessp 3 2', 0);
  this.assert_equals('less? 3 4', 1);
  this.assert_equals('less? 3 3', 0);
  this.assert_equals('less? 3 2', 0);
  this.assert_equals('3 < 4', 1);
  this.assert_equals('3 < 3', 0);
  this.assert_equals('3 < 2', 0);
  this.assert_equals('lessequalp 3 4', 1);
  this.assert_equals('lessequalp 3 3', 1);
  this.assert_equals('lessequalp 3 2', 0);
  this.assert_equals('lessequal? 3 4', 1);
  this.assert_equals('lessequal? 3 3', 1);
  this.assert_equals('lessequal? 3 2', 0);
  this.assert_equals('3 <= 4', 1);
  this.assert_equals('3 <= 3', 1);
  this.assert_equals('3 <= 2', 0);

  this.assert_equals('"3 < "22', 1);

  for (var i = 0; i < 10; i += 1) {
    this.assert_predicate('random 10', function(x) { return 0 <= x && x < 10; });
  }
  for (i = 0; i < 10; i += 1) {
    this.assert_predicate('(random 1 6)', function(x) { return 1 <= x && x <= 6; });
  }
  this.assert_equals('rerandom  make "x random 100  rerandom  make "y random 100  :x - :y', 0);
  this.assert_equals('(rerandom 123) make "x random 100  (rerandom 123)  make "y random 100  :x - :y', 0);
  
  this.assert_stream('type form 123.456 10 0', '       123');
  this.assert_stream('type form 123.456 10 1', '     123.5');
  this.assert_stream('type form 123.456 10 2', '    123.46'); 
  this.assert_stream('type form 123.456 10 3', '   123.456');
  this.assert_stream('type form 123.456 10 4', '  123.4560');
  this.assert_stream('type form 123.456 10 5', ' 123.45600');
  this.assert_stream('type form 123.456 10 6', '123.456000');
  this.assert_stream('type form 123.456 10 7', '123.4560000');
  this.assert_stream('type form 123.456 10 8', '123.45600000');

  this.assert_equals('bitand 1 2', 0);
  this.assert_equals('bitand 7 2', 2);
  this.assert_equals('(bitand 7 11 15)', 3);

  this.assert_equals('bitor 1 2', 3);
  this.assert_equals('bitor 7 2', 7);
  this.assert_equals('(bitor 1 2 4)', 7);

  this.assert_equals('bitxor 1 2', 3);
  this.assert_equals('bitxor 7 2', 5);
  this.assert_equals('(bitxor 1 2 7)', 4);

  this.assert_equals('bitnot 0', -1);
  this.assert_equals('bitnot -1', 0);
  this.assert_equals('bitand (bitnot 123) 123', 0);

  this.assert_equals('ashift 1 2', 4);
  this.assert_equals('ashift 8 -2', 2);
  this.assert_equals('lshift 1 2', 4);
  this.assert_equals('lshift 8 -2', 2);

  this.assert_equals('ashift -1024 -1', -512);
  this.assert_equals('ashift -1 -1', -1);
  this.assert_equals('lshift -1 -1', 0x7fffffff);
});

QUnit.test("Logical Operations", function(t) {
  t.expect(29);

  this.assert_equals('true', 1);
  this.assert_equals('false', 0);
  this.assert_equals('and 0 0', 0);
  this.assert_equals('and 0 1', 0);
  this.assert_equals('and 1 0', 0);
  this.assert_equals('and 1 1', 1);
  this.assert_equals('(and 0 0 0)', 0);
  this.assert_equals('(and 1 0 1)', 0);
  this.assert_equals('(and 1 1 1)', 1);
  this.assert_equals('or 0 0', 0);
  this.assert_equals('or 0 1', 1);
  this.assert_equals('or 1 0', 1);
  this.assert_equals('or 1 1', 1);
  this.assert_equals('(or 0 0 0)', 0);
  this.assert_equals('(or 1 0 1)', 1);
  this.assert_equals('(or 1 1 1)', 1);
  this.assert_equals('xor 0 0', 0);
  this.assert_equals('xor 0 1', 1);
  this.assert_equals('xor 1 0', 1);
  this.assert_equals('xor 1 1', 0);
  this.assert_equals('(xor 0 0 0)', 0);
  this.assert_equals('(xor 1 0 1)', 0);
  this.assert_equals('(xor 1 1 1)', 1);
  this.assert_equals('not 0', 1);
  this.assert_equals('not 1', 0);

  this.assert_stream('and 0 (print "nope)', '');
  this.assert_stream('or 1 (print "nope)', '');

  this.assert_stream('and 1 (type "yup)', 'yup');
  this.assert_stream('or 0 (type "yup)', 'yup');
});

QUnit.test("Graphics", function(t) {
  t.expect(182);

  var white = [0xff, 0xff, 0xff, 0xff],
      black = [0, 0, 0, 0xff],
      red = [0xff, 0, 0, 0xff];

  this.run('clearscreen');
  this.assert_equals('clean home (list heading xcor ycor)', [0, 0, 0]);
  this.assert_pixel('cs', 150, 150, [0xff,0xff,0xff,0xff]);

  this.assert_equals('home forward 100 pos', [0, 100]);
  this.assert_equals('home fd 100 pos', [0, 100]);
  this.assert_equals('home back 100 pos', [0, -100]);
  this.assert_equals('home bk 100 pos', [0, -100]);
  this.assert_equals('home left 45 heading', -45);
  this.assert_equals('home lt 45 heading', -45);
  this.assert_equals('home right 45 heading', 45);
  this.assert_equals('home rt 45 heading', 45);

  this.assert_equals('home \u2190 heading', -15);
  this.assert_equals('home \u2192 heading', 15);
  this.assert_equals('home \u2191 pos', [0, 10]);
  this.assert_equals('home \u2193 pos', [0, -10]);

  this.assert_equals('setpos [ 12 34 ] pos', [12, 34]);
  this.assert_equals('setxy 56 78 pos', [56, 78]);
  this.assert_equals('setxy 0 0 (list xcor ycor)', [0, 0]);
  this.assert_equals('setx 123 xcor', 123);
  this.assert_equals('sety 45 ycor', 45);
  this.assert_equals('setheading 69 heading', 69);
  this.assert_equals('seth 13 heading', 13);

  this.assert_equals('forward 100 rt 90 home (list heading xcor ycor)', [0, 0, 0]);

  this.assert_equals('home arc 123 456 (list heading xcor ycor)', [0, 0, 0]);

  this.assert_pixels('cs  setpw 10  arc 45 100', [
    [150, 150, white],
    [150+100*Math.cos(Math.PI * 8/8), 150-100*Math.sin(Math.PI * 8/8)|0, white],
    [150+100*Math.cos(Math.PI * 7/8), 150-100*Math.sin(Math.PI * 7/8)|0, white],
    [150+100*Math.cos(Math.PI * 6/8), 150-100*Math.sin(Math.PI * 6/8)|0, white],
    [150+100*Math.cos(Math.PI * 5/8), 150-100*Math.sin(Math.PI * 5/8)|0, white],
    [150+100*Math.cos(Math.PI * 4/8), 150-100*Math.sin(Math.PI * 4/8)|0, black],
    [150+100*Math.cos(Math.PI * 3/8), 150-100*Math.sin(Math.PI * 3/8)|0, black],
    [150+100*Math.cos(Math.PI * 2/8), 150-100*Math.sin(Math.PI * 2/8)|0, black],
    [150+100*Math.cos(Math.PI * 1/8), 150-100*Math.sin(Math.PI * 1/8)|0, white],
    [150+100*Math.cos(Math.PI * 0/8), 150-100*Math.sin(Math.PI * 0/8)|0, white]
  ]);
  this.assert_pixels('cs  setpw 10  arc -45 100', [
    [150, 150, white],
    [150+100*Math.cos(Math.PI * 8/8), 150-100*Math.sin(Math.PI * 8/8)|0, white],
    [150+100*Math.cos(Math.PI * 7/8), 150-100*Math.sin(Math.PI * 7/8)|0, white],
    [150+100*Math.cos(Math.PI * 6/8), 150-100*Math.sin(Math.PI * 6/8)|0, black],
    [150+100*Math.cos(Math.PI * 5/8), 150-100*Math.sin(Math.PI * 5/8)|0, black],
    [150+100*Math.cos(Math.PI * 4/8), 150-100*Math.sin(Math.PI * 4/8)|0, black],
    [150+100*Math.cos(Math.PI * 3/8), 150-100*Math.sin(Math.PI * 3/8)|0, white],
    [150+100*Math.cos(Math.PI * 2/8), 150-100*Math.sin(Math.PI * 2/8)|0, white],
    [150+100*Math.cos(Math.PI * 1/8), 150-100*Math.sin(Math.PI * 1/8)|0, white],
    [150+100*Math.cos(Math.PI * 0/8), 150-100*Math.sin(Math.PI * 0/8)|0, white]
  ]);

  this.assert_pixels('cs  pu  setxy 50 50  arc 360 20  fill', [
    [150, 150, white],
    [150 + 50, 150 - 50, black]
  ]);

  ['"red', '4', '[99 0 0]'].forEach(function(color) {
    this.assert_pixels('cs  pu  filled ' + color + ' [ arc 135 100 ]', [
      [150, 150, white],
      [150 + 100, 150 - 100, white],
      [150 + 10, 150 - 90, red],
      [150 + 90, 150, red],
    ]);
  }.bind(this));

  this.assert_pixels('cs  pd  filled "black [ fd 100 pu bk 100 rt 90 fd 100 pd lt 90 fd 100 ]', [
    [150 + 25, 150 - 50, black],
    [150 + 75, 150 - 50, black],
    [150 + 50, 150 - 25, white],
    [150 + 50, 150 - 75, white],
  ]);

  this.assert_equals('setpos [ 12 34 ] pos', [12, 34]);
  this.assert_equals('setx 123 xcor', 123);
  this.assert_equals('sety 45 ycor', 45);
  this.assert_equals('setheading 69 heading', 69);
  this.assert_equals('seth 69 heading', 69);
  this.assert_equals('setxy -100 -100 towards [ 0 0 ]', 45);

  this.assert_equals('showturtle shownp', 1);
  this.assert_equals('st shownp', 1);
  this.assert_equals('hideturtle shownp', 0);
  this.assert_equals('ht shownp', 0);
  this.assert_equals('setpos [ 12 34 ] clean pos', [12, 34]);
  this.assert_equals('setpos [ 12 34 ] clearscreen (list heading xcor ycor)', [0, 0, 0]);
  this.assert_equals('setpos [ 12 34 ] cs (list heading xcor ycor)', [0, 0, 0]);
  this.assert_equals('wrap turtlemode', 'WRAP');

  this.assert_equals('setxy 0 0 setxy 160 160 (list xcor ycor)', [-140, -140]);
  this.assert_equals('window turtlemode', 'WINDOW');
  this.assert_equals('setxy 0 0 setxy 160 160 (list xcor ycor)', [160, 160]);

  this.assert_equals('fence turtlemode', 'FENCE');
  this.assert_equals('setxy 0 0 setxy 160 160 (list xcor ycor)', [150, 150]);

  this.assert_equals('wrap turtlemode', 'WRAP');

  this.assert_equals('(label "a 1 [ 2 [ 3 ] ])', undefined);
  this.assert_equals('setlabelheight 5 labelsize', [5, 5]);
  this.assert_equals('setlabelheight 10 labelsize', [10, 10]);

  this.assert_equals('setpalette 8 "pink  palette 8', 'pink');
  this.assert_equals('setpalette 9 [0 50 99]  palette 9', '#0080ff');

  this.assert_equals('setlabelfont "Times\\ New\\ Roman  labelfont', 'Times New Roman');

  this.assert_equals('cs  wrap  setscrunch 0.5 0.5  fd 50 pos', [0, 50]);
  this.assert_equals('cs  wrap  setscrunch 0.5 0.5  fd 350 pos', [0, -250]);
  this.assert_equals('cs  setscrunch 1 0.5  setxy 50 50  setscrunch 1 1  pos', [50, 25]);

  this.assert_pixels('cs  setscrunch 0.5 1.5  setpw 10  arc 360 100', [
    [150, 150, white],

    [150 - 100, 150, white],
    [150 + 100, 150, white],
    [150 - 50, 150, black],
    [150 + 50, 150, black],

    [150, 150 - 100, white],
    [150, 150 + 100, white],
    [150, 150 - 149, black],
    [150, 150 + 149, black]
  ]);

  this.assert_pixels('cs  setscrunch 0.5 3  setpw 10  arc 360 100', [
    [150, 150, black],

    [150 - 100, 150, white],
    [150 + 100, 150, white],
    [150 - 50, 150, black],
    [150 + 50, 150, black],

    [150, 150 - 100, white],
    [150, 150 + 100, white],
    [150, 150 - 149, white],
    [150, 150 + 149, white]
  ]);

  this.run('cs setscrunch 1 1');

  this.assert_equals('cs fd 100 setturtle 2 pos', [0, 0]);
  this.assert_equals('cs fd 100 setturtle 2 rt 90 setturtle 1 pos', [0, 100]);
  this.assert_equals('cs ht setturtle 2 shownp', 1);
  this.assert_equals('cs setturtle 2 ht setturtle 1 shownp', 1);
  this.assert_equals('cs ht setturtle 2 setturtle 1 shownp', 0);
  this.assert_equals('cs ht ask 2 [ pu ] shownp', 0);
  this.assert_equals('cs pu setturtle 2 pendownp', 1);
  this.assert_equals('cs setturtle 2 pu setturtle 1 pendownp', 1);
  this.assert_equals('cs pu setturtle 2 setturtle 1 pendownp', 0);
  this.assert_equals('cs pu ask 2 [ ht ] pendownp', 0);

  this.assert_equals('cs  setxy 100 100  setscrunch 2 2  pos', [50, 50]);
  this.run('cs setscrunch 1 1');
  this.assert_equals('cs  ask 2 [ setxy 100 100 ]  setscrunch 2 2  setturtle 2  pos', [50, 50]);
  this.run('cs setscrunch 1 1');

  this.assert_equals('showturtle shownp', 1);
  this.assert_equals('hideturtle shownp', 0);

  this.assert_equals('wrap turtlemode', 'WRAP');
  this.assert_equals('window turtlemode', 'WINDOW');
  this.assert_equals('fence turtlemode', 'FENCE');
  this.assert_equals('wrap turtlemode', 'WRAP');

  this.assert_equals('setlabelheight 5 labelsize', [5, 5]);

  this.assert_equals('( item 2 bounds ) + ( item 1 bounds )', 0);
  this.assert_equals('( item 4 bounds ) + ( item 3 bounds )', 0);
  this.assert_equals('make "x ( item 1 bounds )  setscrunch 2 1  :x = (item 1 bounds) * 2', 1);
  this.assert_equals('make "y ( item 3 bounds )  setscrunch 1 3  :x = (item 3 bounds) * 3', 1);

  this.assert_equals('clearturtles turtle', 1);
  this.assert_equals('clearturtles setturtle 10 setturtle 5 turtle', 5);
  this.assert_equals('clearturtles setturtle 10 setturtle 5 turtles', 10);
  this.assert_equals('clearscreen setturtle 3 turtles', 3);

  this.assert_equals('pendown pendownp', 1);
  this.assert_equals('penup pendownp', 0);
  this.assert_equals('pd pendownp', 1);
  this.assert_equals('pu pendownp', 0);
  this.run('pendown');

  this.assert_equals('penpaint penmode', 'PAINT');
  this.assert_equals('penerase penmode', 'ERASE');
  this.assert_equals('penreverse penmode', 'REVERSE');
  this.run('penpaint');

  this.assert_equals('setpencolor 0 pencolor', 'black');
  this.assert_pixel('cs setpw 10  fd 0', 150, 150, black);

  this.assert_equals('setpc 0 pencolor', 'black');
  this.assert_pixel('cs setpw 10  fd 0', 150, 150, black);

  this.assert_equals('setpencolor "#123456 pencolor', '#123456');
  this.assert_pixel('cs setpw 10  fd 0', 150, 150, [0x12, 0x34, 0x56, 0xff]);

  this.assert_equals('setpencolor [0 50 99] pencolor', '#0080ff');
  this.assert_pixel('cs setpw 10  fd 0', 150, 150, [0, 0x80, 0xff, 0xff]);

  this.assert_equals('setpensize 6 pensize', [6, 6]);
  this.assert_equals('setpensize [6 6] pensize', [6, 6]);

  this.assert_equals('setbackground 0 background', 'black');
  this.assert_equals('setscreencolor 0 background', 'black');
  this.assert_equals('setsc 0 background', 'black');
  this.assert_equals('setbackground "#123456 background', '#123456');
  this.assert_equals('setbackground [0 50 99] background', '#0080ff');
  this.assert_pixel('setbackground "white', 150, 150, white);
  this.assert_pixel('setbackground "red', 150, 150, red);