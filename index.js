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
  