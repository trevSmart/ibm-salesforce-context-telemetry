/**
 * CSRF Protection Middleware
 * 
 * Implements Double Submit Cookie pattern for CSRF protection.
 * This is a modern alternative to the deprecated csurf package.
 */

const crypto = require('crypto');

/**
 * Generate a CSRF token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Middleware to generate and set CSRF token
 */
function csrfProtection(req, res, next) {
  // Skip CSRF for safe methods (GET, HEAD, OPTIONS)
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Skip CSRF for /telemetry endpoint (external API)
  if (req.path === '/telemetry') {
    return next();
  }

  // Get token from header or body
  const token = req.headers['x-csrf-token'] || req.body._csrf;
  
  // Get expected token from cookie
  const cookieToken = req.cookies['csrf-token'];

  // Validate token
  if (!token || !cookieToken || token !== cookieToken) {
    return res.status(403).json({
      status: 'error',
      message: 'Invalid CSRF token'
    });
  }

  next();
}

/**
 * Middleware to set CSRF token in cookie
 */
function setCsrfToken(req, res, next) {
  // Generate token if not exists
  if (!req.cookies['csrf-token']) {
    const token = generateToken();
    res.cookie('csrf-token', token, {
      httpOnly: false, // Must be accessible to JavaScript
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
  }
  next();
}

/**
 * Get CSRF token from request
 */
function getToken(req) {
  return req.cookies['csrf-token'] || generateToken();
}

module.exports = {
  csrfProtection,
  setCsrfToken,
  getToken,
  generateToken
};
