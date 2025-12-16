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
		Object.defineProperty(patched, 'name', { value: 'includes' });
	} catch (_err) {
		// ignore if redefining name fails
	}

	String.prototype.includes = patched;
})();
