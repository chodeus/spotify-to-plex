// Port of eslint-plugin-react 7.37.5 `destructuring-assignment` ("always"), function components only.
const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const WRAPPERS = new Set(['memo', 'forwardRef']);

function isWrapperCall(node) {
    if (!node || node.type !== 'CallExpression') {
        return false;
    }

    const { callee } = node;
    if (callee.type === 'Identifier') {
        return WRAPPERS.has(callee.name);
    }

    return callee.type === 'MemberExpression'
        && callee.object.type === 'Identifier'
        && callee.object.name === 'React'
        && callee.property.type === 'Identifier'
        && WRAPPERS.has(callee.property.name);
}

function isCapitalized(name) {
    return typeof name === 'string' && /^[A-Z]/.test(name);
}

function isJSXOrNull(node) {
    if (!node) {
        return false;
    }

    switch (node.type) {
        case 'JSXElement':
        case 'JSXFragment':
            return true;
        case 'Literal':
            return node.value === null;
        case 'ConditionalExpression':
            return isJSXOrNull(node.consequent) || isJSXOrNull(node.alternate);
        case 'LogicalExpression':
            return isJSXOrNull(node.left) || isJSXOrNull(node.right);
        case 'SequenceExpression':
            return isJSXOrNull(node.expressions.at(-1));
        case 'TSAsExpression':
        case 'TSSatisfiesExpression':
        case 'TSNonNullExpression':
            return isJSXOrNull(node.expression);
        default:
            return false;
    }
}

module.exports = {
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce destructuring of props in function components',
            recommended: false
        },
        messages: {
            useDestructAssignment: 'Must use destructuring {{type}} assignment'
        },
        schema: []
    },

    create(context) {
        const { visitorKeys } = context.sourceCode;
        const propsNames = [];

        // Returns of this function only: a nested callback's JSX does not make it a component.
        function returnsJSXOrNull(fn) {
            if (fn.body.type !== 'BlockStatement') {
                return isJSXOrNull(fn.body);
            }

            let found = false;
            const visit = node => {
                if (found || !node || typeof node.type !== 'string') {
                    return;
                }

                if (node.type === 'ReturnStatement') {
                    found = isJSXOrNull(node.argument);

                    return;
                }

                if (FUNCTION_TYPES.has(node.type)) {
                    return;
                }

                for (const key of visitorKeys[node.type] || []) {
                    const child = node[key];
                    if (Array.isArray(child)) {
                        child.forEach(visit);
                    } else {
                        visit(child);
                    }
                }
            };
            fn.body.body.forEach(visit);

            return found;
        }

        function isComponent(fn) {
            const { parent } = fn;
            let named = false;
            if (fn.type === 'FunctionDeclaration') {
                named = fn.id ? isCapitalized(fn.id.name) : parent.type === 'ExportDefaultDeclaration';
            } else if (parent.type === 'VariableDeclarator') {
                named = parent.id.type === 'Identifier' && isCapitalized(parent.id.name);
            } else if (parent.type === 'Property') {
                named = parent.key.type === 'Identifier' && isCapitalized(parent.key.name);
            } else {
                named = isWrapperCall(parent) || parent.type === 'ExportDefaultDeclaration';
            }

            return named && returnsJSXOrNull(fn);
        }

        function propsNameOf(fn) {
            let [param] = fn.params;
            if (param && param.type === 'AssignmentPattern') {
                param = param.left;
            }

            return param && param.type === 'Identifier' ? param.name : null;
        }

        function enter(fn) {
            if (isComponent(fn)) {
                propsNames.push({ fn, name: propsNameOf(fn) });
            }
        }

        function exit(fn) {
            if (propsNames.length > 0 && propsNames.at(-1).fn === fn) {
                propsNames.pop();
            }
        }

        function currentPropsName() {
            return propsNames.length > 0 ? propsNames.at(-1).name : null;
        }

        return {
            FunctionDeclaration: enter,
            FunctionExpression: enter,
            ArrowFunctionExpression: enter,
            'FunctionDeclaration:exit': exit,
            'FunctionExpression:exit': exit,
            'ArrowFunctionExpression:exit': exit,
            MemberExpression(node) {
                const name = currentPropsName();
                if (!name || node.optional || node.object.type !== 'Identifier' || node.object.name !== name) {
                    return;
                }

                const { parent } = node;
                if (parent.type === 'AssignmentExpression' && parent.left === node) {
                    return;
                }

                context.report({ node, messageId: 'useDestructAssignment', data: { type: name } });
            },
            TSQualifiedName(node) {
                const name = currentPropsName();
                if (!name || node.left.type !== 'Identifier' || node.left.name !== name) {
                    return;
                }

                if (context.sourceCode.getAncestors(node).some(ancestor => ancestor.type === 'TSTypeQuery')) {
                    context.report({ node, messageId: 'useDestructAssignment', data: { type: 'props' } });
                }
            }
        };
    }
};
