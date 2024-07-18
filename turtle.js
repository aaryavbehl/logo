(function(global) {
    'use strict';
  
    function deg2rad(d) { return d / 180 * Math.PI; }
    function rad2deg(r) { return r * 180 / Math.PI; }
  
    function font(px, name) {
      px = Number(px);
      name = String(name).toLowerCase();
      if (['serif', 'sans-serif', 'cursive', 'fantasy', 'monospace'].indexOf(name) === -1)
        name = JSON.stringify(name);
      return String(px) + 'px ' + name;
    }
  
    function mod(a, b) {
      var r = a % b;
      return r < 0 ? r + b : r;
    }
  
    function CanvasTurtle(canvas_ctx, turtle_ctx, w, h, events) {

      canvas_ctx.fillText = canvas_ctx.fillText || function fillText(string, x, y) { };
  
      this.canvas_ctx = canvas_ctx;
      this.turtle_ctx = turtle_ctx;
      this.width = Number(w);
      this.height = Number(h);
  
      this.x = this.py = 0;
      this.y = this.py = 0;
      this.r = Math.PI / 2;
  
      this.sx = this.sy = 1;
  
      this.color = '#000000';
      this.bgcolor = '#ffffff';
      this.penwidth = 1;
      this.penmode = 'paint';
      this.fontsize = 14;
      this.fontname = 'sans-serif';
      this.turtlemode = 'wrap';
      this.visible = true;
      this.pendown = true;
  
      this.was_oob = false;
      this.filling = 0;
  
      this._clickx = this._clicky = 0;
      this._mousex = this._mousey = 0;
      this._buttons = 0;
      this._touches = [];
  
      this._turtles = [{}];
      this._currentturtle = 0;
  
      this._init();
      this._tick();
  
      if (events) {
        var mouse_handler = function(e) {
          var rect = events.getBoundingClientRect();
          this._mousemove(e.clientX - rect.left, e.clientY - rect.top, e.buttons);
        }.bind(this);
        ['mousemove', 'mousedown', 'mouseup'].forEach(function(e) {
          events.addEventListener(e, mouse_handler);
        });
  
        var touch_handler = function(e) {
          var rect = events.getBoundingClientRect();
          var touches = Array.from(e.touches).map(function(t) {
            return {x: t.clientX - rect.left, y: t.clientY - rect.top};
          });
          this._touch(touches);
        }.bind(this);
        ['touchstart', 'touchmove', 'touchend'].forEach(function(e) {
          events.addEventListener(e, touch_handler);
        });
  
      }
    }
  
    Object.defineProperties(CanvasTurtle.prototype, {
  
      _init: {value: function() {
        this.turtle_ctx.lineCap = 'round';
        this.turtle_ctx.strokeStyle = 'green';
        this.turtle_ctx.lineWidth = 2;
  
        this.canvas_ctx.lineCap = 'round';

        this.color = this.color;
        this.fontname = this.fontname;
        this.fontsize = this.fontsize;
        this.penmode = this.penmode;
        this.penwidth = this.penwidth;
  
        [this.turtle_ctx, this.canvas_ctx].forEach(function(ctx) {
          ctx.setTransform(this.sx, 0, 0, -this.sy, this.width / 2, this.height / 2);
        }.bind(this));
      }},
  
      _tick: {value: function() {
        function invert(p) { return [-p[0], p[1]]; }
  
        requestAnimationFrame(this._tick.bind(this));
        var cur = JSON.stringify([this.x, this.y, this.r, this.visible,
                                  this.sx, this.sy, this.width, this.height, this._turtles]);
        if (cur === this._last_state) return;
        this._last_state = cur;
  
        this.turtle_ctx.save();
        this.turtle_ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.turtle_ctx.clearRect(0, 0, this.width, this.height);
        this.turtle_ctx.restore();
  
        function _draw(ctx, turtle) {
          if (turtle.visible) {
            ctx.save();
            ctx.translate(turtle.x, turtle.y);
            ctx.rotate(Math.PI/2 + turtle.r);
            ctx.beginPath();
  
            var points = [
              [0, -20], 
              [2.5, -17],
              [3, -12],
  
              [6, -10],
              [9, -13], 
              [13, -12],
              [18, -4],
              [18, 0],
              [14, -1],
              [10, -7],
  
              [8, -6], 
              [10, -2],
              [9, 3],
              [6, 10],
  
              [9, 13], 
              [6, 15],
              [3, 12],
  
              [0, 13],
            ];
  
            points.concat(points.slice(1, -1).reverse().map(invert))
            .forEach(function(pair, index) {
              ctx[index ? 'lineTo' : 'moveTo'](pair[0], pair[1]);
            });

          ctx.closePath();
          ctx.stroke();

          ctx.restore();
        }
      }
      
      _draw(this.turtle_ctx, this);

      for (var i = 0; i < this._turtles.length; ++i) {
        if (this._turtles[i] === undefined || i == this.currentturtle) {
          continue;
        }
        _draw(this.turtle_ctx, this._turtles[i]);
      }
    }},

    _moveto: {value: function(x, y, setpos) {

      var _go = function(x1, y1, x2, y2) {
        if (this.pendown) {
          if (this.filling) {
            this.canvas_ctx.lineTo(x1, y1);
            this.canvas_ctx.lineTo(x2, y2);
          } else {
            this.canvas_ctx.beginPath();
            this.canvas_ctx.moveTo(x1, y1);
            this.canvas_ctx.lineTo(x2, y2);
            this.canvas_ctx.stroke();
          }
        }
      }.bind(this);

      var w = this.width / this.sx, h = this.height / this.sy;

      var left = -w / 2, right = w / 2,
          bottom = -h / 2, top = h / 2;

      var ix, iy, wx, wy, fx, fy, less;

      if (setpos && this.turtlemode === 'wrap') {
        var oob = (x < left || x >= right || y < bottom || y >= top);
        var px = x, py = y;
        if (this.was_oob) {
          var dx = mod(x + w / 2, w) - (x + w / 2);
          var dy = mod(y + h / 2, h) - (y + h / 2);
          x += dx;
          y += dy;
          this.x = this.px + dx;
          this.y = this.py + dy;
        }
        this.was_oob = oob;
        this.px = px;
        this.py = py;
      } else {
        this.was_oob = false;
      }

      while (true) {

        switch (this.turtlemode) {
        case 'window':
          _go(this.x, this.y, x, y);
          this.x = this.px = x;
          this.y = this.py = y;
          return;

        default:
        case 'wrap':
        case 'fence':

          fx = 1;
          fy = 1;

          if (x < left) {
            fx = (this.x - left) / (this.x - x);
          } else if (x > right) {
            fx = (this.x - right) / (this.x - x);
          }

          if (y < bottom) {
            fy = (this.y - bottom) / (this.y - y);
          } else if (y > top) {
            fy = (this.y - top) / (this.y - y);
          }

          if (!isFinite(fx) || !isFinite(fy)) {
            console.log('x', x, 'left', left, 'right', right);
            console.log('y', y, 'bottom', bottom, 'top', top);
            console.log('fx', fx, 'fy', fy);
            throw new Error("Wrapping error: non-finite fraction");
          }

          ix = x;
          iy = y;

          wx = x;
          wy = y;

          if (fx < 1 && fx <= fy) {
            less = (x < left);
            ix = less ? left : right;
            iy = this.y - fx * (this.y - y);
            x += less ? w : -w;
            wx = less ? right : left;
            wy = iy;
          } else if (fy < 1 && fy <= fx) {
            less = (y < bottom);
            ix = this.x - fy * (this.x - x);
            iy = less ? bottom : top;
            y += less ? h : -h;
            wx = ix;
            wy = less ? top : bottom;
          }

          _go(this.x, this.y, ix, iy);

          if (this.turtlemode === 'fence') {

            this.x = this.px = ix;
            this.y = this.py = iy;
            return;
          } else {

            this.x = wx;
            this.y = wy;
            if (fx >= 1 && fy >= 1)
              return;
          }

          break;
        }
      }
    }},

    _mousemove: {value: function(x, y, b) {
      this._mousex = (x - this.width / 2) / this.sx;
      this._mousey = (y - this.height / 2) / -this.sy;
      this._buttons = b;
    }},

    _mouseclick: {value: function(x, y, b) {
      this._clickx = (x - this.width / 2) / this.sx;
      this._clicky = (y - this.height / 2) / -this.sy;
      this._buttons = b;
    }},

    _touch: {value: function(touches) {
      this._touches = touches.map(function(touch) {
        return [
          (touch.x - this.width / 2) / this.sx,
          (touch.y - this.height / 2) / -this.sy
        ];
      }.bind(this));
    }},