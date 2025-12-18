const js = require('@eslint/js');

module.exports = [
	js.configs.recommended,
	{
		ignores: [
			'node_modules/**',
			'dist/**',
			'public/css/output.css',
			'public/vendor/**',
			'**/*.min.js',
			'**/*.d.ts',
			'eslint.config.js',
			'postcss.config.js',
			'tailwind.config.js'
		]
	},
	// CommonJS configuration for backend files
	{
		files: ['src/**/*.js'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'commonjs',
			globals: {
				console: 'readonly',
				process: 'readonly',
				Buffer: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
				module: 'readonly',
				require: 'readonly',
				exports: 'readonly',
				global: 'readonly',
				setTimeout: 'readonly',
				setInterval: 'readonly',
				clearTimeout: 'readonly',
				clearInterval: 'readonly',
				window: 'readonly',
				document: 'readonly',
				navigator: 'readonly',
				localStorage: 'readonly',
				sessionStorage: 'readonly',
				fetch: 'readonly',
				XMLHttpRequest: 'readonly',
				Event: 'readonly',
				CustomEvent: 'readonly',
				URL: 'readonly',
				URLSearchParams: 'readonly',
				alert: 'readonly',
				confirm: 'readonly',
				requestAnimationFrame: 'readonly',
				cancelAnimationFrame: 'readonly',
				performance: 'readonly',
				MutationObserver: 'readonly',
				Notification: 'readonly',
				echarts: 'readonly',
				Image: 'readonly',
				WebKitCSSMatrix: 'readonly',
				self: 'readonly',
				wx: 'readonly',
				define: 'readonly',
				AbortController: 'readonly',
				AbortSignal: 'readonly',
				Element: 'readonly',
				HTMLElement: 'readonly',
				FormData: 'readonly',
				ResizeObserver: 'readonly'
			}
		},
		rules: {
			'indent': ['warn', 'tab', { 'CallExpression': {'arguments': 1} }],
			'linebreak-style': ['error', 'unix'],
			'quotes': ['error', 'single'],
			'semi': ['error', 'always'],
			'no-unused-vars': ['warn', {
				argsIgnorePattern: '^_',
				varsIgnorePattern: '^_',
				caughtErrorsIgnorePattern: '^_'
			}],
			'no-console': 'off',
			'no-prototype-builtins': 'off',
			'no-fallthrough': 'warn',
			'no-useless-escape': 'warn'
		}
	},
	// ES modules configuration for frontend files with module imports
	{
		files: ['public/js/notifications.js', 'public/js/teams.js'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: {
				console: 'readonly',
				document: 'readonly',
				window: 'readonly',
				navigator: 'readonly',
				localStorage: 'readonly',
				fetch: 'readonly',
				XMLHttpRequest: 'readonly',
				Event: 'readonly',
				CustomEvent: 'readonly',
				URL: 'readonly',
				URLSearchParams: 'readonly',
				alert: 'readonly',
				confirm: 'readonly',
				requestAnimationFrame: 'readonly',
				cancelAnimationFrame: 'readonly',
				performance: 'readonly',
				MutationObserver: 'readonly',
				setTimeout: 'readonly',
				setInterval: 'readonly',
				clearTimeout: 'readonly',
				clearInterval: 'readonly',
				HTMLElement: 'readonly',
				FormData: 'readonly',
				ResizeObserver: 'readonly',
				Element: 'readonly',
				FileReader: 'readonly'
			}
		},
		rules: {
			'indent': ['warn', 'tab', { 'CallExpression': {'arguments': 1} }],
			'linebreak-style': ['error', 'unix'],
			'quotes': ['error', 'single'],
			'semi': ['error', 'always'],
			'no-unused-vars': ['warn', {
				argsIgnorePattern: '^_',
				varsIgnorePattern: '^_',
				caughtErrorsIgnorePattern: '^_'
			}],
			'no-console': 'off',
			'no-prototype-builtins': 'off',
			'no-fallthrough': 'warn',
			'no-useless-escape': 'warn'
		}
	},
	// Configuration for other frontend files (script tags)
	{
		files: ['public/js/**/*.js'],
		ignores: ['public/js/notifications.js', 'public/js/teams.js'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'script',
			globals: {
				console: 'readonly',
				process: 'readonly',
				Buffer: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
				module: 'readonly',
				require: 'readonly',
				exports: 'readonly',
				global: 'readonly',
				setTimeout: 'readonly',
				setInterval: 'readonly',
				clearTimeout: 'readonly',
				clearInterval: 'readonly',
				window: 'readonly',
				document: 'readonly',
				navigator: 'readonly',
				localStorage: 'readonly',
				sessionStorage: 'readonly',
				fetch: 'readonly',
				XMLHttpRequest: 'readonly',
				Event: 'readonly',
				CustomEvent: 'readonly',
				URL: 'readonly',
				URLSearchParams: 'readonly',
				alert: 'readonly',
				confirm: 'readonly',
				requestAnimationFrame: 'readonly',
				cancelAnimationFrame: 'readonly',
				performance: 'readonly',
				MutationObserver: 'readonly',
				Notification: 'readonly',
				echarts: 'readonly',
				Image: 'readonly',
				WebKitCSSMatrix: 'readonly',
				self: 'readonly',
				wx: 'readonly',
				define: 'readonly',
				AbortController: 'readonly',
				AbortSignal: 'readonly',
				Element: 'readonly',
				HTMLElement: 'readonly',
				FormData: 'readonly',
				ResizeObserver: 'readonly'
			}
		},
		rules: {
			'indent': ['warn', 'tab', { 'CallExpression': {'arguments': 1} }],
			'linebreak-style': ['error', 'unix'],
			'quotes': ['error', 'single'],
			'semi': ['error', 'always'],
			'no-unused-vars': ['warn', {
				argsIgnorePattern: '^_',
				varsIgnorePattern: '^_',
				caughtErrorsIgnorePattern: '^_'
			}],
			'no-console': 'off',
			'no-prototype-builtins': 'off',
			'no-fallthrough': 'warn',
			'no-useless-escape': 'warn'
		}
	}
];


