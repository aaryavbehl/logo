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
  
