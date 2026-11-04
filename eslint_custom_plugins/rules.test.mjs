import { describe, it } from 'node:test';

import tsParser from '@typescript-eslint/parser';
import { RuleTester } from 'eslint';

import plugin from './index.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
    languageOptions: {
        parser: tsParser,
        parserOptions: { ecmaFeatures: { jsx: true } }
    }
});

const strict = [{ ignoreDOMComponents: false, ignoreRefs: false, allowArrowFunctions: false, allowFunctions: false, allowBind: false }];

tester.run('jsx-no-bind', plugin.rules['jsx-no-bind'], {
    valid: [
        { code: 'function C() { const h = useCallback(() => {}, []); return <B onClick={h} />; }', options: strict },
        { code: 'function C() { let h = () => {}; return <B onClick={h} />; }', options: strict },
        { code: 'const h = () => {}; function C() { return <B onClick={h} />; }', options: strict },
        { code: 'function C() { return <B disabled label="x" {...rest} />; }', options: strict },
        { code: 'function C() { return <div onClick={() => {}} />; }', options: [{ ignoreDOMComponents: true }] },
        { code: 'function C() { return <div ref={el => {}} />; }', options: [{ ignoreRefs: true, ignoreDOMComponents: true }] },
        { code: 'function C() { return <B onClick={() => {}} />; }', options: [{ allowArrowFunctions: true }] }
    ],
    invalid: [
        { code: 'function C() { return <B onClick={() => {}} />; }', options: strict, errors: [{ messageId: 'arrowFunc' }] },
        { code: 'function C() { return <B onClick={function () {}} />; }', options: strict, errors: [{ messageId: 'func' }] },
        { code: 'function C() { return <B onClick={f.bind(null)} />; }', options: strict, errors: [{ messageId: 'bindCall' }] },
        { code: 'function C() { return <B onClick={c ? () => {} : undefined} />; }', options: strict, errors: [{ messageId: 'arrowFunc' }] },
        { code: 'function C() { const h = () => {}; return <B onClick={h} />; }', options: strict, errors: [{ messageId: 'arrowFunc' }] },
        { code: 'function C() { function h() {} return <B onClick={h} />; }', options: strict, errors: [{ messageId: 'func' }] },
        { code: 'function C() { const h = f.bind(null); return <B onClick={h} />; }', options: strict, errors: [{ messageId: 'bindCall' }] },
        { code: 'function C() { if (c) { const h = () => {}; return <B onClick={h} />; } return null; }', options: strict, errors: [{ messageId: 'arrowFunc' }] },
        { code: 'function C() { const h = () => {}; return items.map(i => { return <B key={i} onClick={h} />; }); }', options: strict, errors: [{ messageId: 'arrowFunc' }] },
        { code: 'const C = () => <B onClick={() => 1} />;', options: strict, errors: [{ messageId: 'arrowFunc' }] },
        { code: 'function C() { return <div ref={el => {}} onClick={() => {}} />; }', options: strict, errors: [{ messageId: 'arrowFunc' }, { messageId: 'arrowFunc' }] }
    ]
});

tester.run('destructuring-assignment', plugin.rules['destructuring-assignment'], {
    valid: [
        'function C({ a }) { return <div>{a}</div>; }',
        'const C = forwardRef((props, ref) => { const { a } = props; return <div ref={ref}>{a}</div>; });',
        'function helper(props) { return props.a; }',
        'function Helper(props) { return props.a; }',
        'const renderRow = props => <div>{props.a}</div>;',
        'const o = { render(props) { return <div>{props.a}</div>; } };',
        'function C(props) { return <div>{props?.a}</div>; }',
        'function C(props) { props.a = 1; return null; }',
        'function Outer(props) { function Row(q) { const { b } = q; return <i>{b}</i>; } return <Row b={1} />; }'
    ],
    invalid: [
        { code: 'function C(props) { return <div>{props.a}</div>; }', errors: [{ messageId: 'useDestructAssignment', data: { type: 'props' } }] },
        { code: 'const C = props => <div>{props.a}</div>;', errors: 1 },
        { code: 'const C = memo(props => <div>{props.a}</div>);', errors: 1 },
        { code: 'const C = React.memo(function Inner(props) { return <div>{props.a}</div>; });', errors: 1 },
        { code: 'export default function (props) { return <div>{props.x}</div>; }', errors: 1 },
        { code: 'export default props => <div>{props.x}</div>;', errors: 1 },
        { code: 'const o = { Render(props) { return <div>{props.a}</div>; } };', errors: 1 },
        { code: 'const C = (props = defaults) => <div>{props.a}</div>;', errors: 1 },
        { code: 'function C(props) { const f = useCallback(() => props.a, [props]); return <B onClick={f} />; }', errors: 1 },
        { code: 'function C(props) { return props.a ? <div /> : null; }', errors: 1 },
        { code: 'function C(props) { return <div>{props["a"]}</div>; }', errors: 1 },
        { code: 'function C(p) { return <div>{p.a}</div>; }', errors: [{ messageId: 'useDestructAssignment', data: { type: 'p' } }] },
        { code: 'function C(props: { a: number }) { type T = typeof props.a; const t: T = 1; return <div>{t}</div>; }', errors: 1 },
        { code: 'function C(p: { a: number }) { type T = typeof p.a; const t: T = 1; return <div>{t}</div>; }', errors: [{ messageId: 'useDestructAssignment', data: { type: 'p' } }] },
        { code: 'function C(props) { const el = <div>{props.a}</div>; return el; }', errors: 1 },
        { code: 'function C(props) { return React.createElement("div", null, props.a); }', errors: 1 },
        { code: 'function C(props) { return createElement("div", null, props.a); }', errors: 1 }
    ]
});

tester.run('jsx-no-leaked-render', plugin.rules['jsx-no-leaked-render'], {
    valid: [
        'const C = ({ a }) => <div>{!!a && <i />}</div>;',
        'const C = ({ a }) => <div>{Boolean(a) && <i />}</div>;',
        'const C = ({ a }) => <div>{a > 0 && <i />}</div>;',
        'const C = ({ a, b }) => <div>{!!a && b > 1 && <i />}</div>;',
        'const C = ({ a }) => <div>{a ? <i /> : null}</div>;',
        'const C = ({ a }) => <div>{a || <i />}</div>;',
        'const t = true; const C = () => <div>{t && <i />}</div>;'
    ],
    invalid: [
        { code: 'const C = ({ a }) => <div>{a && <i />}</div>;', errors: [{ messageId: 'noPotentialLeakedRender' }] },
        { code: 'const C = ({ a }) => <div>{a.length && <i />}</div>;', errors: 1 },
        { code: 'const C = ({ a, b }) => <div>{!!a && b && <i />}</div>;', errors: 1 },
        { code: 'const C = ({ a, b }) => <div>{a && b && <i />}</div>;', errors: 1 },
        { code: 'const t = 1; const C = () => <div>{t && <i />}</div>;', errors: 1 }
    ]
});
