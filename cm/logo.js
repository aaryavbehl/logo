if (typeof CodeMirror !== 'undefined') {
  CodeMirror.defineMode('logo', function(config, parserConfig) {

    var regexQuoted = /^(["'](?:[^ \f\n\r\t\v[\](){}\\]|\\[^])*)/;
    var regexOwnWord = /^([\u2190-\u2193])/;
    var regexNumber = /^([0-9]*\.?[0-9]+(?:[eE]\s*[\-+]?\s*[0-9]+)?)/;
    var regexVariable  = /^(:(:?[\u2190-\u2193]|[^ \f\n\r\t\v[\](){}+\-*/%^=<>]+))/;
    var regexWord = /^([\u2190-\u2193]|[^ \f\n\r\t\v[\](){}+\-*/%^=<>]+)/;
    var regexOperator = /^(>=|<=|<>|[+\-*/%^=<>[\]{}()])/;

    return {
      electricChars: "[]dD", 

      startState: function() {
        return {
          state: 'normal',
          indent: 0
        };
      },

      indent: function(state, textAfter) {
        var size = 2;
        var indent = state.indent;
        if (/^\]/.test(textAfter))
          --indent;
        switch(state.state) {
        case 'defn-name':
          return (indent + 1 ) * size;
        case 'defn-vars':
        case 'defn-body':
          if (/^END\b/i.test(textAfter))
            return indent * size;
          return (indent + 1 ) * size;
        default:
          return indent * size;;
        }
      },

      token: function(stream, state) {
        var name, i;

        if (stream.eatSpace()) {
          return null;
        }

        if (stream.match(/^;.*/, true)) {
          return 'logo-comment';
        }

        if (state.state === 'normal') {
          if (stream.match(/^TO\b/i, true)) {
            state.state = 'defn-name';
            return 'logo-defn-start';
          }
          if (stream.match(/^END\b/i, true)) {
            return 'logo-error';
          }
        }

        if (state.state === 'defn-name') {
          if (stream.match(regexWord, true)) {

            state.state = 'defn-vars';
            return 'logo-defn-name';
          }
          stream.next();
          state.state = 'normal';
          return 'logo-error';
        }

        if (state.state === 'defn-vars') {
          if (stream.match(regexVariable, true)) {
            return 'logo-defn-arg';
          }
          state.state = 'defn-body';
        }

        if (state.state === 'defn-body') {

          if (stream.match(/^END\b/i, true)) {
            state.state = 'normal';
            return 'logo-defn-end';
          }
        }

        if (state.state === 'normal' || state.state === 'defn-body') {

          if (stream.match(regexNumber, true)) {
            return 'logo-number';
          }

          if (stream.match(regexQuoted, true)) {
            return 'logo-string';
          }

          if (stream.match(/^\[/, true)) {
            ++state.indent;
            return 'logo-operator';
          }

          if (stream.match(/^\]/, true)) {
            if (state.indent > 0) --state.indent;
            return 'logo-operator';
          }

          if (stream.match(regexOperator, true)) {
            return 'logo-operator';
          }

          if (stream.match(regexVariable, true)) {
            return 'logo-variable';
          }

          if (stream.match(/^(TRUE|FALSE|ELSE)\b/i, true)) {
            return 'logo-keyword';
          }

          if (stream.match(regexOwnWord, true) || stream.match(regexWord, true)) {
            return 'logo-word';
          }

          stream.next();
          return 'logo-error';
        }

        throw 'WTF?';
      }
    };
  });

  CodeMirror.defineMIME("text/x-logo", "logo");
}