// Port of eslint-plugin-react 7.37.5 `jsx-no-bind`, which has no ESLint 10 release.
const messages = {
    bindCall: 'JSX props should not use .bind()',
    arrowFunc: 'JSX props should not use arrow functions',
    func: 'JSX props should not use functions'
};

module.exports = {
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Disallow .bind(), arrow functions and functions in JSX props, directly or through a const or function declared in an enclosing block',
            recommended: false
        },
        messages,
        schema: [{
            type: 'object',
            properties: {
                allowArrowFunctions: { type: 'boolean', default: false },
                allowBind: { type: 'boolean', default: false },
                allowFunctions: { type: 'boolean', default: false },
                ignoreRefs: { type: 'boolean', default: false },
                ignoreDOMComponents: { type: 'boolean', default: false }
            },
            additionalProperties: false
        }]
    },

    create(context) {
        const options = context.options[0] || {};
        const sourceCode = context.sourceCode;
        const namesByBlock = new Map();

        function violationType(node) {
            if (!options.allowBind
                && node.type === 'CallExpression'
                && node.callee.type === 'MemberExpression'
                && node.callee.property.type === 'Identifier'
                && node.callee.property.name === 'bind') {
                return 'bindCall';
            }

            if (node.type === 'ConditionalExpression') {
                return violationType(node.test) || violationType(node.consequent) || violationType(node.alternate);
            }

            if (!options.allowArrowFunctions && node.type === 'ArrowFunctionExpression') {
                return 'arrowFunc';
            }

            if (!options.allowFunctions && (node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration')) {
                return 'func';
            }

            return null;
        }

        // Nearest first, as the original rule searches them.
        function enclosingBlocks(node) {
            return sourceCode.getAncestors(node).filter(ancestor => ancestor.type === 'BlockStatement')
                .reverse();
        }

        function remember(node, name, type) {
            const [block] = enclosingBlocks(node);
            if (block && type && name) {
                namesByBlock.get(block).set(name, type);
            }
        }

        function isDOMComponent(openingElement) {
            const { name } = openingElement;

            return name.type === 'JSXIdentifier' && /^[a-z]/.test(name.name);
        }

        return {
            BlockStatement(node) {
                namesByBlock.set(node, new Map());
            },
            FunctionDeclaration(node) {
                remember(node, node.id && node.id.name, violationType(node));
            },
            VariableDeclarator(node) {
                if (!node.init || node.parent.kind !== 'const' || node.id.type !== 'Identifier') {
                    return;
                }

                remember(node, node.id.name, violationType(node.init));
            },
            JSXAttribute(node) {
                if (options.ignoreRefs && node.name.type === 'JSXIdentifier' && node.name.name === 'ref') {
                    return;
                }

                if (!node.value || node.value.type !== 'JSXExpressionContainer' || node.value.expression.type === 'JSXEmptyExpression') {
                    return;
                }

                if (options.ignoreDOMComponents && isDOMComponent(node.parent)) {
                    return;
                }

                const value = node.value.expression;
                if (value.type === 'Identifier') {
                    const type = enclosingBlocks(node).map(block => namesByBlock.get(block).get(value.name))
                        .find(Boolean);
                    if (type) {
                        context.report({ node, messageId: type });
                    }

                    return;
                }

                const type = violationType(value);
                if (type) {
                    context.report({ node, messageId: type });
                }
            }
        };
    }
};
