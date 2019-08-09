/**
 * Wrapper for built-in http.js to emulate the browser XMLHttpRequest object.
 *
 * Modified for use in Titanium Mobile.
 *
 * This can be used with JS designed for browsers to improve reuse of code and
 * allow the use of existing libraries.
 *
 * Usage: include("XMLHttpRequest.js") and use XMLHttpRequest per W3C specs.
 *
 * @author Dan DeFelippi <dan@driverdan.com>
 * @contributor David Ellis <d.f.ellis@ieee.org>
 * @license MIT
 */

const http = require('./http').default;
const Url = require('./url').default;

const https = http;

/**
 * Module exports.
 */

module.exports = XMLHttpRequest;

// backwards-compat
XMLHttpRequest.XMLHttpRequest = XMLHttpRequest;

/**
 * `XMLHttpRequest` constructor.
 *
 * Supported options for the `opts` object are:
 *
 *  - `agent`: An http.Agent instance; http.globalAgent may be used; if 'undefined', agent usage is disabled
 *
 * @param {Object} opts optional "options" object
 */

function XMLHttpRequest(opts) {
	'use strict';

	opts = opts || {};

	/**
   * Private variables
   */
	var self = this;

	// Holds http.js objects
	var request;
	var response;

	// Request settings
	var settings = {};

	// Disable header blacklist.
	// Not part of XHR specs.
	var disableHeaderCheck = false;

	// Set some default headers
	var defaultHeaders = {
		'User-Agent': 'node-XMLHttpRequest',
		Accept: '*/*'
	};

	var headers = Object.assign({}, defaultHeaders);

	// These headers are not user setable.
	// The following are allowed but banned in the spec:
	// * user-agent
	var forbiddenRequestHeaders = [
		'accept-charset',
		'accept-encoding',
		'access-control-request-headers',
		'access-control-request-method',
		'connection',
		'content-length',
		'content-transfer-encoding',
		'cookie',
		'cookie2',
		'date',
		'expect',
		'host',
		'keep-alive',
		'origin',
		'referer',
		'te',
		'trailer',
		'transfer-encoding',
		'upgrade',
		'via'
	];

	// These request methods are not allowed
	var forbiddenRequestMethods = [
		'TRACE',
		'TRACK',
		'CONNECT'
	];

	// Send flag
	var sendFlag = false;
	// Error flag, used when errors occur or abort is called
	var errorFlag = false;

	// Event listeners
	var listeners = {};

	/**
   * Constants
   */

	this.UNSENT = 0;
	this.OPENED = 1;
	this.HEADERS_RECEIVED = 2;
	this.LOADING = 3;
	this.DONE = 4;

	/**
   * Public vars
   */

	// Current state
	this.readyState = this.UNSENT;

	// default ready state change handler in case one is not set or is set late
	this.onreadystatechange = null;

	// Result & response
	this.responseText = '';
	this.responseXML = '';
	this.status = null;
	this.statusText = null;

	/**
   * Private methods
   */

	/**
   * Check if the specified header is allowed.
   *
   * @param string header Header to validate
   * @return boolean False if not allowed, otherwise true
   */
	function isAllowedHttpHeader(header) {
		return disableHeaderCheck || (header && forbiddenRequestHeaders.indexOf(header.toLowerCase()) === -1);
	}

	/**
   * Check if the specified method is allowed.
   *
   * @param string method Request method to validate
   * @return boolean False if not allowed, otherwise true
   */
	function isAllowedHttpMethod(method) {
		return (method && forbiddenRequestMethods.indexOf(method) === -1);
	}

	/**
   * Public methods
   */

	/**
   * Open the connection. Currently supports local server requests.
   *
   * @param string method Connection method (eg GET, POST)
   * @param string url URL for the connection.
   * @param boolean async Asynchronous connection. Default is true.
   * @param string user Username for basic authentication (optional)
   * @param string password Password for basic authentication (optional)
   */
	this.open = function (method, url, async, user, password) {
		this.abort();
		errorFlag = false;

		// Check for valid request method
		if (!isAllowedHttpMethod(method)) {
			throw new Error('SecurityError: Request method not allowed');
		}

		settings = {
			method: method,
			url: url.toString(),
			async: (typeof async !== 'boolean' ? true : async),
			user: user || null,
			password: password || null
		};

		setState(this.OPENED);
	};

	/**
   * Disables or enables isAllowedHttpHeader() check the request. Enabled by default.
   * This does not conform to the W3C spec.
   *
   * @param boolean state Enable or disable header checking.
   */
	this.setDisableHeaderCheck = function (state) {
		disableHeaderCheck = state;
	};

	/**
   * Sets a header for the request.
   *
   * @param string header Header name
   * @param string value Header value
   * @return boolean Header added
   */
	this.setRequestHeader = function (header, value) {
		if (this.readyState !== this.OPENED) {
			throw new Error('INVALID_STATE_ERR: setRequestHeader can only be called when state is OPEN');
		}
		if (!isAllowedHttpHeader(header)) {
			console.warn('Refused to set unsafe header "' + header + '"');
			return false;
		}
		if (sendFlag) {
			throw new Error('INVALID_STATE_ERR: send flag is true');
		}
		headers[header] = value;
		return true;
	};

	/**
   * Gets a header from the server response.
   *
   * @param string header Name of header to get.
   * @return string Text of the header or null if it doesn't exist.
   */
	this.getResponseHeader = function (header) {
		if (typeof header === 'string'
      && this.readyState > this.OPENED
      && response.headers[header.toLowerCase()]
      && !errorFlag
		) {
			return response.headers[header.toLowerCase()];
		}

		return null;
	};

	/**
   * Gets all the response headers.
   *
   * @return string A string with all response headers separated by CR+LF
   */
	this.getAllResponseHeaders = function () {
		if (this.readyState < this.HEADERS_RECEIVED || errorFlag) {
			return '';
		}
		var result = '';

		for (var i in response.headers) {
			// Cookie headers are excluded
			if (i !== 'set-cookie' && i !== 'set-cookie2') {
				result += i + ': ' + response.headers[i] + '\r\n';
			}
		}
		return result.substr(0, result.length - 2);
	};

	/**
   * Gets a request header
   *
   * @param string name Name of header to get
   * @return string Returns the request header or empty string if not set
   */
	this.getRequestHeader = function (name) {
		// @TODO Make this case insensitive
		if (typeof name === 'string' && headers[name]) {
			return headers[name];
		}

		return '';
	};

	/**
   * Sends the request to the server.
   *
   * @param string data Optional data to send as request body.
   */
	this.send = function (data) {
		if (this.readyState !== this.OPENED) {
			throw new Error('INVALID_STATE_ERR: connection must be opened before send() is called');
		}

		if (sendFlag) {
			throw new Error('INVALID_STATE_ERR: send has already been called');
		}

		var ssl = false,
			local = false;
		var url = Url.parse(settings.url);
		var hostname;
		// Determine the server
		switch (url.protocol) {
			case 'https:':
				ssl = true;
				// SSL & non-SSL both need host, no break here.
			case 'http:':
				hostname = url.hostname;
				break;

			case 'file:':
				local = true;
				break;

			case undefined:
			case '':
				hostname = 'localhost';
				break;

			default:
				throw new Error('Protocol not supported.');
		}

		// Load files off the local filesystem (file://)
		if (local) {
			throw new Error('The "local" option is not supported on TItanium.');
		}

		// Default to port 80. If accessing localhost on another port be sure
		// to use http://localhost:port/path
		var port = url.port || (ssl ? 443 : 80);
		// Add query string if one is used
		var uri = url.pathname + (url.search ? url.search : '');

		// Set the Host header or the server may reject the request
		headers['Host'] = url.hostname;
		if (!((ssl && port === 443) || port === 80)) {
			headers['Host'] += ':' + url.port;
		}

		// Set Basic Auth if necessary
		if (settings.user) {
			if (typeof settings.password === 'undefined') {
				settings.password = '';
			}
			headers['Authorization'] = 'Basic ' + settings.user + ':' + settings.password;
		}

		// Set content length header
		if (settings.method === 'GET' || settings.method === 'HEAD') {
			data = null;
		} else if (data) {
			headers['Content-Length'] = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data);

			if (!headers['Content-Type']) {
				headers['Content-Type'] = 'text/plain;charset=UTF-8';
			}
		} else if (settings.method === 'POST') {
			// For a post with no data set Content-Length: 0.
			// This is required by buggy servers that don't meet the specs.
			headers['Content-Length'] = 0;
		}

		var agent = opts.agent || false;
		var options = {
			protocol: url.protocol,
			hostname: hostname,
			port: port,
			path: uri,
			pathname: url.pathname,
			search: url.search,
			hash: url.hash,
			method: settings.method,
			headers: headers,
			agent: agent
		};

		if (ssl) {
			options.pfx = opts.pfx;
			options.key = opts.key;
			options.passphrase = opts.passphrase;
			options.cert = opts.cert;
			options.ca = opts.ca;
			options.ciphers = opts.ciphers;
			options.rejectUnauthorized = opts.rejectUnauthorized;
		}

		// Reset error flag
		errorFlag = false;

		// Handle async requests
		if (settings.async) {
			// Use the proper protocol
			var doRequest = ssl ? https.request : http.request;

			// Request is being sent, set send flag
			sendFlag = true;

			// As per spec, this is called here for historical reasons.
			self.dispatchEvent('readystatechange');

			// Handler for the response
			function responseHandler(resp) {
				// Set response var to the response we got back
				// This is so it remains accessable outside this scope
				response = resp;
				// Check for redirect
				// @TODO Prevent looped redirects
				if (response.statusCode === 302 || response.statusCode === 303 || response.statusCode === 307) {
					// Change URL to the redirect location
					settings.url = response.headers.location;
					var url = Url.parse(settings.url);
					// Options for the new request
					var newOptions = {
						hostname: url.hostname,
						port: url.port,
						path: url.path,
						method: response.statusCode === 303 ? 'GET' : settings.method,
						headers: headers
					};

					if (ssl) {
						newOptions.pfx = opts.pfx;
						newOptions.key = opts.key;
						newOptions.passphrase = opts.passphrase;
						newOptions.cert = opts.cert;
						newOptions.ca = opts.ca;
						newOptions.ciphers = opts.ciphers;
						newOptions.rejectUnauthorized = opts.rejectUnauthorized;
					}

					// Issue the new request
					request = doRequest(newOptions, responseHandler).on('error', errorHandler);
					request.end();
					// @TODO Check if an XHR event needs to be fired here
					return;
				}

				if (response && response.setEncoding) {
					response.setEncoding('utf8');
				}

				setState(self.HEADERS_RECEIVED);
				self.status = response.statusCode;

				response.on('data', function (chunk) {
					// Make sure there's some data
					if (chunk) {
						self.responseText += chunk;
					}
					// Don't emit state changes if the connection has been aborted.
					if (sendFlag) {
						setState(self.LOADING);
					}
				});

				response.on('end', function () {
					if (sendFlag) {
						// The sendFlag needs to be set before setState is called.  Otherwise if we are chaining callbacks
						// there can be a timing issue (the callback is called and a new call is made before the flag is reset).
						sendFlag = false;
						// Discard the 'end' event if the connection has been aborted
						setState(self.DONE);
					}
				});

				response.on('error', function (error) {
					self.handleError(error);
				});
			}

			// Error handler for the request
			function errorHandler(error) {
				self.handleError(error);
			}

			// Create the request
			request = doRequest(options, responseHandler).on('error', errorHandler);

			// Node 0.4 and later won't accept empty data. Make sure it's needed.
			if (data) {
				request.write(data);
			}

			request.end();

			self.dispatchEvent('loadstart');
		} else { // Synchronous
			throw new Error('Synchronous requests are not supported in Titanium.');
		}
	};

	/**
   * Called when an error is encountered to deal with it.
   */
	this.handleError = function (error) {
		this.status = 503;
		this.statusText = error;
		this.responseText = error.stack;
		errorFlag = true;
		setState(this.DONE);
	};

	/**
   * Aborts a request.
   */
	this.abort = function () {
		if (request) {
			request.abort();
			request = null;
		}

		headers = Object.assign({}, defaultHeaders);
		this.responseText = '';
		this.responseXML = '';

		errorFlag = true;

		if (this.readyState !== this.UNSENT
        && (this.readyState !== this.OPENED || sendFlag)
        && this.readyState !== this.DONE) {
			sendFlag = false;
			setState(this.DONE);
		}
		this.readyState = this.UNSENT;
	};

	/**
   * Adds an event listener. Preferred method of binding to events.
   */
	this.addEventListener = function (event, callback) {
		if (!(event in listeners)) {
			listeners[event] = [];
		}
		// Currently allows duplicate callbacks. Should it?
		listeners[event].push(callback);
	};

	/**
   * Remove an event callback that has already been bound.
   * Only works on the matching funciton, cannot be a copy.
   */
	this.removeEventListener = function (event, callback) {
		if (event in listeners) {
			// Filter will return a new array with the callback removed
			listeners[event] = listeners[event].filter(function (ev) {
				return ev !== callback;
			});
		}
	};

	/**
   * Dispatch any events, including both "on" methods and events attached using addEventListener.
   */
	this.dispatchEvent = function (event) {
		if (typeof self['on' + event] === 'function') {
			self['on' + event]();
		}
		if (event in listeners) {
			for (var i = 0, len = listeners[event].length; i < len; i++) {
				listeners[event][i].call(self);
			}
		}
	};

	/**
   * Changes readyState and calls onreadystatechange.
   *
   * @param int state New state
   */
	function setState(state) {
		if (self.readyState !== state) {
			self.readyState = state;

			if (settings.async || self.readyState < self.OPENED || self.readyState === self.DONE) {
				self.dispatchEvent('readystatechange');
			}

			if (self.readyState === self.DONE && !errorFlag) {
				self.dispatchEvent('load');
				// @TODO figure out InspectorInstrumentation::didLoadXHR(cookie)
				self.dispatchEvent('loadend');
			}
		}
	}
}
