const colorRegExp = /\u001b\[\d\d?m/g; // eslint-disable-line no-control-regex

function removeColors(str) {
	return str.replace(colorRegExp, '');
}

function getConstructorOf(obj) {
	while (obj) {
		const descriptor = Object.getOwnPropertyDescriptor(obj, 'constructor');
		if (descriptor !== undefined
        && typeof descriptor.value === 'function'
        && descriptor.value.name !== '') {
			return descriptor.value;
		}

		obj = Object.getPrototypeOf(obj);
	}

	return null;
}

const kNodeModulesRE = /^(.*)[\\/]node_modules[\\/]/;

let getStructuredStack;
class StackTraceError extends Error { }
StackTraceError.prepareStackTrace = (err, trace) => trace;
StackTraceError.stackTraceLimit = Infinity;

function isInsideNodeModules() {
	if (getStructuredStack === undefined) {
		getStructuredStack = () => new StackTraceError().stack;
	}

	let stack = getStructuredStack();

	// stack is only an array on v8, try to convert manually if string
	if (typeof stack === 'string') {
		const stackFrames = [];
		const lines = stack.split(/\n/);
		for (const line of lines) {
			const lineInfo = line.match(/(.*)@(.*):(\d+):(\d+)/);
			if (lineInfo) {
				const filename = lineInfo[2].replace('file://', '');
				stackFrames.push({ getFileName: () => filename });
			}
		}
		stack = stackFrames;
	}

	// Iterate over all stack frames and look for the first one not coming
	// from inside Node.js itself:
	if (Array.isArray(stack)) {
		for (const frame of stack) {
			const filename = frame.getFileName();
			// If a filename does not start with / or contain \,
			// it's likely from Node.js core.
			if (!/^\/|\\/.test(filename)) {
				continue;
			}
			return kNodeModulesRE.test(filename);
		}
	}
	return false;
}

module.exports = {
	getConstructorOf,
	removeColors,
	isInsideNodeModules
};
