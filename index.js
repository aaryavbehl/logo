if (!('console' in window)) {
    window.console = { log: function(){}, error: function(){} };
  }
  
  function $(s) { return document.querySelector(s); }
  function $$(s) { return document.querySelectorAll(s); }
  
  function escapeHTML(s) {
    return String(s).replace(/[&<>]/g, function(c) {
      switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      default: return c;
      }
    });
  }
  
  var logo, turtle;

  var examples = 'examples.txt';
  
  function hook(orig, func) {
    return function() {
      try {
        func.apply(this, arguments);
      } finally {
        if (orig)
          orig.apply(this, arguments);
      }
    };
  }
  
  var savehook;
  var historyhook;
  var clearhistoryhook;
  
  function initStorage(loadhook) {
    if (!window.indexedDB)
      return;
  
    var req = indexedDB.open('logo', 3);
    req.onblocked = function() {
      Dialog.alert("Please close other Logo pages to allow database upgrade to proceed.");
    };
    req.onerror = function(e) {
      console.error(e);
    };
    req.onupgradeneeded = function(e) {
      var db = req.result;
      if (e.oldVersion < 2) {
        db.createObjectStore('procedures');
      }
      if (e.oldVersion < 3) {
        db.createObjectStore('history', {autoIncrement: true});
      }
    };
    req.onsuccess = function() {
      var db = req.result;
  
      var tx = db.transaction('procedures');
      tx.objectStore('procedures').openCursor().onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
          try {
            loadhook(cursor.value);
          } catch (ex) {
            console.error("Error loading procedure: " + ex);
          } finally {
            cursor.continue();
          }
        }
      };
      tx = db.transaction('history');
      tx.objectStore('history').openCursor().onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
          try {
            historyhook(cursor.value);
          } catch (ex) {
            console.error("Error loading procedure: " + ex);
          } finally {
            cursor.continue();
          }
        }
      };
  
      tx.oncomplete = function() {
        savehook = hook(savehook, function(name, def) {
          var tx = db.transaction('procedures', 'readwrite');
          if (def)
            tx.objectStore('procedures').put(def, name);
          else
            tx.objectStore('procedures')['delete'](name);
        });
  
        historyhook = hook(historyhook, function(entry) {
          var tx = db.transaction('history', 'readwrite');
          tx.objectStore('history').put(entry);
        });
  
        clearhistoryhook = hook(clearhistoryhook, function() {
          var tx = db.transaction('history', 'readwrite');
          tx.objectStore('history').clear();
        });
      };
    };
  }

  var commandHistory = (function() {
    var entries = [], pos = -1;
  
    clearhistoryhook = hook(clearhistoryhook, function() {
      entries = [];
      pos = -1;
    });
  
    return {
      push: function(entry) {
        if (entries.length > 0 && entries[entries.length - 1] === entry) {
          pos = -1;
          return;
        }
        entries.push(entry);
        pos = -1;
        if (historyhook) {
          historyhook(entry);
        }
      },
      next: function() {
        if (entries.length === 0) {
          return undefined;
        }
        if (pos === -1) {
          pos = 0;
        } else {
          pos = (pos === entries.length - 1) ? 0 : pos + 1;
        }
        return entries[pos];
      },
      prev: function() {
        if (entries.length === 0) {
          return undefined;
        }
        if (pos === -1) {
          pos = entries.length - 1;
        } else {
          pos = (pos === 0) ? entries.length - 1 : pos - 1;
        }
        return entries[pos];
      }
    };
  }());

var input = {};
function initInput() {

  function keyNameForEvent(e) {
    window.ke = e;
    return e.key ||
      ({ 3: 'Enter', 10: 'Enter', 13: 'Enter',
         38: 'ArrowUp', 40: 'ArrowDown', 63232: 'ArrowUp', 63233: 'ArrowDown' })[e.keyCode];
  }

  input.setMulti = function() {

    document.body.classList.remove('single');
    document.body.classList.add('multi');
  };

  input.setSingle = function() {

    document.body.classList.remove('multi');
    document.body.classList.add('single');
  };

  var isMulti = function() {
    return document.body.classList.contains('multi');
  };

  function run(remote) {
    if (remote !== true && window.TogetherJS && window.TogetherJS.running) {
      TogetherJS.send({type: "run"});
    }
    var error = $('#display #error');
    error.classList.remove('shown');

    var v = input.getValue();
    if (v === '') {
      return;
    }
    commandHistory.push(v);
    if (!isMulti()) {
      input.setValue('');
    }
    setTimeout(function() {
      document.body.classList.add('running');
      logo.run(v).catch(function (e) {
        error.innerHTML = '';
        error.appendChild(document.createTextNode(e.message));
        error.classList.add('shown');
      }).then(function() {
        document.body.classList.remove('running');
      });
    }, 100);
  }

  function stop() {
    logo.bye();
    document.body.classList.remove('running');
  }

  input.run = run;

  function clear(remote) {
    if (remote !== true && window.TogetherJS && window.TogetherJS.running) {
      TogetherJS.send({type: "clear"});
    }
    input.setValue('');
  }
  input.clear = clear;

  if (typeof CodeMirror !== 'undefined') {
    var BRACKETS = '()[]{}';

    CodeMirror.keyMap['single-line'] = {
      'Enter': function(cm) {
         run();
       },
      'Up': function(cm) {
        var v = commandHistory.prev();
        if (v !== undefined) {
          cm.setValue(v);
          cm.setCursor({line: 0, ch: v.length});
        }
      },
      'Down': function(cm) {
        var v = commandHistory.next();
        if (v !== undefined) {
          cm.setValue(v);
          cm.setCursor({line: 0, ch: v.length});
        }
      },
      fallthrough: ['default']
    };
    var cm = CodeMirror.fromTextArea($('#logo-ta-single-line'), {
      autoCloseBrackets: { pairs: BRACKETS, explode: false },
      matchBrackets: true,
      lineComment: ';',
      keyMap: 'single-line'
    });
    $('#logo-ta-single-line + .CodeMirror').id = 'logo-cm-single-line';

    cm.setSize('100%', cm.defaultTextHeight() + 4 + 4); 

    cm.on("change", function(cm, change) {
      if (change.text.length > 1) {
        var v = input.getValue();
        input.setMulti();
        input.setValue(v);
        input.setFocus();
      }
    });

    var cm2 = CodeMirror.fromTextArea($('#logo-ta-multi-line'), {
      autoCloseBrackets: { pairs: BRACKETS, explode: BRACKETS },
      matchBrackets: true,
      lineComment: ';',
      lineNumbers: true
    });
    $('#logo-ta-multi-line + .CodeMirror').id = 'logo-cm-multi-line';
    cm2.setSize('100%', '100%');

    cm2.on('keydown', function(instance, event) {
      if (keyNameForEvent(event) === 'Enter' && event.ctrlKey) {
        event.preventDefault();
        run();
      }
    });
