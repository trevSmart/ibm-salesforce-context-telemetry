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
	} catch (_err) {
		console.error('Failed to redefine name of patched includes function:', _err);
	}

	// eslint-disable-next-line no-extend-native
	String.prototype.includes = patched;
}());
