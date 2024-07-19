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

