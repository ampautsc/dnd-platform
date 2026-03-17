/**
 * MockApi
 *
 * Simulates REST API calls for tests and local dev.
 * Pre-configure responses per path or let it return default fixtures.
 */
export class MockApi {
  constructor(fixtures = {}) {
    this.fixtures = { ...fixtures };
    this.errors = {};
    this.calls = [];
  }

  async get(path) {
    this.calls.push({ method: 'GET', path });
    if (this.errors[path]) {
      const err = new Error(this.errors[path].message);
      err.status = this.errors[path].status;
      throw err;
    }
    if (this.fixtures[path] !== undefined) {
      return structuredClone(this.fixtures[path]);
    }
    const err = new Error('Not Found');
    err.status = 404;
    throw err;
  }

  async post(path, body) {
    this.calls.push({ method: 'POST', path, body });
    if (this.errors[path]) {
      const err = new Error(this.errors[path].message);
      err.status = this.errors[path].status;
      throw err;
    }
    if (this.fixtures[path] !== undefined) {
      return structuredClone(this.fixtures[path]);
    }
    const err = new Error('Not Found');
    err.status = 404;
    throw err;
  }

  /** Pre-configure a session join fixture */
  static withSession(code, session) {
    return new MockApi({
      '/api/sessions/join': { ...session, code },
    });
  }

  /** Pre-configure an error for a path */
  static withError(path, status, message) {
    const api = new MockApi();
    api.errors[path] = { status, message };
    return api;
  }
}
