import js from '@eslint/js';
import globals from 'globals';
import node from 'eslint-plugin-n';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';

export default [
	// Base recommended rules
	js.configs.recommended,

	// Global configuration
	{
		plugins: {
			unicorn: eslintPluginUnicorn,
		},
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: {
				...globals.node,
				...globals.es2021,
				...globals.browser,
				echarts: 'readonly',
			},
		},
		rules: {
			// Correctness rules
			'n/no-unsupported-features/node-builtins': ['warn', {
				allowExperimental: true
			}],
			'no-const-assign': 'error',
			'no-constant-condition': 'error',
			'no-constructor-return': 'error',
			'no-empty-pattern': 'error',
			'no-inner-declarations': 'error',
			'no-invalid-regexp': 'error',
			'no-new-native-nonconstructor': 'error',
			'no-obj-calls': 'error',
			'no-redeclare': 'error',
			'no-setter-return': 'error',
			'no-shadow-restricted-names': 'error',
			'no-undef': 'error',
			'no-unreachable': 'error',
			'no-unsafe-finally': 'error',
			'no-unsafe-negation': 'error',
			'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
			'use-isnan': 'error',
			'valid-typeof': 'error',

			// Suspicious rules
			'no-alert': 'error',
			'no-array-constructor': 'error',
			'no-async-promise-executor': 'error',
			'no-await-in-loop': 'off',
			'no-bitwise': 'error',
			'no-caller': 'error',
			'no-case-declarations': 'error',
			'no-class-assign': 'error',
			'no-compare-neg-zero': 'error',
			'no-cond-assign': ['error', 'always'],
			'no-console': 'off',
			'no-debugger': 'warn',
			'no-delete-var': 'error',
			'no-dupe-args': 'error',
			'no-dupe-class-members': 'error',
			'no-dupe-else-if': 'error',
			'no-dupe-keys': 'error',
			'no-duplicate-case': 'error',
			'no-empty': 'error',
			'no-empty-character-class': 'error',
			'no-eval': 'error',
			'no-ex-assign': 'error',
			'no-extra-boolean-cast': 'error',
			'no-extra-semi': 'error',
			'no-fallthrough': 'error',
			'no-func-assign': 'error',
			'no-global-assign': 'error',
			'no-implied-eval': 'error',
			'no-import-assign': 'error',
			'no-irregular-whitespace': 'error',
			'no-loss-of-precision': 'error',
			'no-misleading-character-class': 'error',
			'no-new-symbol': 'error',
			'no-nonoctal-decimal-escape': 'error',
			'no-octal': 'error',
			'no-octal-escape': 'error',
			'no-prototype-builtins': 'error',
			'no-regex-spaces': 'error',
			'no-self-assign': 'error',
			'no-self-compare': 'error',
			'no-sparse-arrays': 'warn',
			'no-this-before-super': 'error',
			'no-unexpected-multiline': 'error',
			'no-unmodified-loop-condition': 'warn',
			'no-unused-labels': 'error',
			'no-useless-catch': 'error',
			'no-useless-escape': 'error',
		'no-var': 'error',
		'no-with': 'error',

		// Style rules
		'arrow-body-style': 'off', // Allow both arrow functions with and without braces
		'semi': ['error', 'always'],
		'object-curly-spacing': ['error', 'never'],
		'block-scoped-var': 'error',
		'curly': ['error', 'all'], // Force braces for all control statements, including single-line ifs (prevents: if (x) y;)
		'dot-notation': 'error',
		'eqeqeq': ['error', 'always'],
		'no-else-return': 'error',
		'no-extra-bind': 'error',
		'no-extra-label': 'error',
		'no-floating-decimal': 'error',
		'no-implicit-coercion': 'error',
		'no-iterator': 'error',
		'no-labels': 'error',
		'no-lone-blocks': 'error',
		'no-loop-func': 'error',
		'no-multi-str': 'error',
		'no-new': 'error',
		'no-new-func': 'error',
		'no-new-wrappers': 'error',
		'no-param-reassign': 'off',
		'no-proto': 'error',
		'no-return-assign': 'warn',
		'no-return-await': 'error',
		'no-script-url': 'error',
		'no-sequences': 'error',
		'no-throw-literal': 'error',
		'no-undef-init': 'error',
		'no-unneeded-ternary': 'error',
		'no-unused-expressions': 'error',
		'no-useless-call': 'error',
		'no-useless-computed-key': 'error',
		'no-useless-concat': 'error',
		'no-useless-constructor': 'error',
		'no-useless-return': 'error',
		'no-void': 'error',
		'prefer-arrow-callback': 'error',
		'prefer-const': 'error',
		'prefer-promise-reject-errors': 'error',
		'prefer-regex-literals': 'error',
		'prefer-rest-params': 'error',
		'prefer-template': 'error',
		'prefer-spread': 'warn',
		'require-await': 'off',
		'yoda': 'error',

		// Formatting rules
		'multiline-ternary': ['warn', 'never'],
		'array-bracket-newline': ['warn', 'consistent'],
		'array-element-newline': ['warn', 'consistent'],
		'object-curly-newline': ['warn', { multiline: false, consistent: true }],

		// Unicorn plugin rules
		'unicorn/prefer-array-some': 'warn',
		'unicorn/prefer-array-find': 'warn',
		'unicorn/prefer-array-flat': 'warn',
		'unicorn/prefer-array-flat-map': 'warn',
		'unicorn/prefer-includes': 'warn',
		'unicorn/prefer-at': 'warn',
		'unicorn/no-array-push-push': 'warn',
		// 'unicorn/explicit-length-check': ['warn', { 'non-zero': 'not-equal' }],
		'unicorn/no-useless-length-check': 'warn',
		'unicorn/prefer-prototype-methods': 'warn',
		'unicorn/no-useless-spread': 'warn',
		'unicorn/prefer-add-event-listener': 'warn',
		'unicorn/prefer-string-starts-ends-with': 'warn',
		'unicorn/prefer-string-trim-start-end': 'warn',
		'unicorn/no-useless-undefined': 'warn',
		'unicorn/no-unnecessary-polyfills': 'warn',
		'unicorn/better-regex': 'warn',
		'unicorn/prefer-node-protocol': 'warn',
		'unicorn/prefer-json-parse-buffer': 'warn',
		'unicorn/prefer-number-properties': 'warn',

		// Complexity rules
		'accessor-pairs': 'error',
		'array-callback-return': 'error',
		'complexity': ['warn', 255],
		'default-case-last': 'error',
		'dot-location': ['error', 'property'],
		'grouped-accessor-pairs': 'error',
		'guard-for-in': 'error',
		'no-div-regex': 'error',
		'no-empty-function': 'error',
		'no-eq-null': 'error',
		'no-extend-native': 'error',
		'no-implicit-globals': 'error',
		'no-multi-assign': 'error',
		'prefer-named-capture-group': 'error',
		'radix': 'error',
		'wrap-iife': 'error',
		},
		ignores: [
			'public/vendor',
		],
	},



	// Node.js specific rules
	{
		plugins: {
			n: node,
		},
		rules: {
			...node.configs['flat/recommended'].rules,
			'n/no-process-exit': 'off',
			'n/no-extraneous-import': 'off',
			'n/no-missing-import': 'off',
			'n/no-unpublished-import': 'off',
		},
	},

	// Vitest globals for test files
	{
		files: ['test/**/*.js', 'test/**/*.ts'],
		languageOptions: {
			globals: {
				...globals.node,
				...globals.es2021,
				...globals.vitest,
			},
		},
	},

	// TypeScript configuration
	{
		files: ['**/*.ts', '**/*.tsx'],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: 'module',
			},
			globals: {
				...globals.node,
				...globals.es2021,
			},
		},
		plugins: {
			'@typescript-eslint': tseslint,
		},
		rules: {
			...tseslint.configs.recommended.rules,
			'no-undef': 'off', // TypeScript handles this
			'no-unused-vars': 'off', // Use @typescript-eslint/no-unused-vars instead
			'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
		},
	},

	// TypeScript test files with Vitest globals
	{
		files: ['test/**/*.ts'],
		languageOptions: {
			globals: {
				...globals.node,
				...globals.es2021,
				...globals.vitest,
			},
		},
	},

	// Ignore patterns
	{
		ignores: [
			'node_modules',
			'public/vendor',
			'tmp',
			'logs',
			'coverage',
			'.vscode',
			'.idea',
			'.cursor',
			'.sfdx',
			'.sf',
			'force-app',
			'venv',
			'env',
			'ENV',
			'__pycache__',
			'notebooks',
			'.git',
			'.npm-cache',
			'dev',
			'docs',
			'hardis-report',
			'*.log',
			'*.swp',
			'*.swo',
			'.DS_Store',
			'*.pyc',
			'*.ipynb',
			'*.config.js',
		'*.config.ts',
		'biome.json',
			'.env',
			'*.code-workspace',
			'.cursorignore',
			'.cursorrules',
			'*.bin',
			'*.exe',
			'*.dll',
			'*.so',
			'*.dylib',
			'*.zip',
			'*.tar',
			'*.gz',
			'*.rar',
			'*.db',
			'*.sqlite',
			'*.sqlite3',
		'*.lock',
		'yarn.lock',
		'pnpm-lock.yaml',
		'**/settings.json',
	],
	},
];
