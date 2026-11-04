module.exports = {
    rules: {
        'one-line-if': require('./rules/one-line-if.js'),
        'simple-ternary-max-length': require('./rules/simple-ternary-max-length.js'),
        'jsx-single-line-props': require('./rules/jsx-single-line-props.js'),
        'jsx-multiline-children': require('./rules/jsx-multiline-children.js'),
        'forwardref-props-destructuring': require('./rules/forwardref-props-destructuring.js'),
        'no-export-only-files': require('./rules/no-export-only-files.js'),
        'jsx-no-bind': require('./rules/jsx-no-bind.js'),
        'destructuring-assignment': require('./rules/destructuring-assignment.js'),
        'jsx-no-leaked-render': require('./rules/jsx-no-leaked-render.js')
    }
}