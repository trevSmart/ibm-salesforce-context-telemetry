/**
 * Safe logging utilities to prevent sensitive data exposure
 */

/**
 * Safely log an error without exposing sensitive information
 * Only logs the error message, not the entire error object
 * @param {string} context - Context message for the error
 * @param {Error} error - Error object to log safely
 */
export function logError(context, error) {
	if (error instanceof Error) {
		console.error(`${context}:`, error.message);
	} else {
		// Handle cases where error is not an Error object
		console.error(`${context}:`, String(error));
	}
}

/**
 * Safely log an error with stack trace in development only
 * In production, only logs the message to prevent information leakage
 * @param {string} context - Context message for the error
 * @param {Error} error - Error object to log safely
 */
export function logErrorWithStack(context, error) {
	if (process.env.NODE_ENV !== 'production' && error instanceof Error && error.stack) {
		console.error(`${context}:`, error.message);
		console.error(error.stack);
	} else {
		logError(context, error);
	}
}