module.exports = {
	content: [
		'./public/**/*.html',
		'./public/**/*.js',
		'./src/**/*.js',
	],
	css: ['public/css/output.css'],
	defaultExtractor: content => {
		// Extreu classes de Tailwind amb variants
		const broadMatches = content.match(/[^\s"'<>`]*[^\s"':<>`]/g) || [];
		const innerMatches = content.match(/[^\s"#%'().<=>[\]`{}]*[^\s"#%'().:<=>[\]`{}]/g) || [];
		return broadMatches.concat(innerMatches);
	},
	safelist: {
		standard: [
			// Classes d'estat i visibilitat comunes
			'hidden',
'block',
'flex',
'grid',
'inline',
'inline-block',
			// Colors d'estat
			'bg-red-500',
'bg-green-500',
'bg-blue-500',
'bg-yellow-500',
			'text-red-500',
'text-green-500',
'text-blue-500',
'text-yellow-500',
			'border-red-500',
'border-green-500',
'border-blue-500',
			// Opacitats
			'opacity-0',
'opacity-25',
'opacity-50',
'opacity-75',
'opacity-100',
			// Classes de tema
			'dark',
'light',
		],
		deep: [
			// Variants dinàmiques
			/^dark:/,
			/^hover:/,
			/^focus:/,
			/^active:/,
			/^disabled:/,
			/^group-hover:/,
			/^peer-focus:/,
			// Classes amb números (com w-1, w-2, etc.)
			/^\w+-\d+$/,
			// Classes de responsive
			/^sm:/,
			/^md:/,
			/^lg:/,
			/^xl:/,
			/^2xl:/,
		],
	},
};
