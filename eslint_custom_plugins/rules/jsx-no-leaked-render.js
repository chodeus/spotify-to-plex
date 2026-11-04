// Port of eslint-plugin-react 7.37.5 `jsx-no-leaked-render` with validStrategies ["ternary", "coerce"], without its autofix.
const COERCED_TYPES = new Set(['UnaryExpression', 'BinaryExpression', 'CallExpression']);

function isCoerced(node) {
    if (node.type === 'LogicalExpression') {
        return isCoerced(node.left) && isCoerced(node.right);
    }

    return COERCED_TYPES.has(node.type);
}

module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Require the left side of a JSX `&&` to be a boolean (`!!x`, a comparison or a call) so 0 or "" never renders',
            recommended: false
        },
        messages: {
            noPotentialLeakedRender: 'Potential leaked value that might cause unintentionally rendered values or rendering crashes'
        },
        schema: []
    },

    create(context) {
        const sourceCode = context.sourceCode;

        function findVariable(node, name) {
            let scope = sourceCode.getScope(node);
            while (scope) {
                const variable = scope.set.get(name);
                if (variable) {
                    return variable;
                }

                scope = scope.upper;
            }

            return null;
        }

        function isBooleanConstant(node, identifier) {
            if (identifier.type !== 'Identifier') {
                return false;
            }

            const variable = findVariable(node, identifier.name);
            const def = variable && variable.defs[0];
            const init = def && def.node && def.node.init;

            return Boolean(init) && init.type === 'Literal' && typeof init.value === 'boolean';
        }

        return {
            'JSXExpressionContainer > LogicalExpression[operator="&&"]'(node) {
                const { left } = node;
                if (isCoerced(left) || isBooleanConstant(node, left)) {
                    return;
                }

                context.report({ node, messageId: 'noPotentialLeakedRender' });
            }
        };
    }
};
