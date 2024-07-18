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