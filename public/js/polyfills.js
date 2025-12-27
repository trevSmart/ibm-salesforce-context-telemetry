(function patchStringIncludes() {
	const originalIncludes = String.prototype.includes;
	if (typeof originalIncludes !== 'function') {
		return;
	}

	const patched = function includes(search, position) {
		if (search instanceof RegExp) {
			search = search.source;
		}
		return originalIncludes.call(this, search, position);
	};

	try {
		Object.defineProperty(patched, 'name', {value: 'includes'});
	} catch {
		// Intentionally ignore: function name redefinition may fail in older environments,
		// but this is non-critical and should not affect runtime behavior.
	}

	// eslint-disable-next-line no-extend-native
	String.prototype.includes = patched;
}());
