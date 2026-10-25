/**
 * Host half of the dsh-plugin-session-notifier bundle.
 *
 * The reminder itself lives in the browser half (`client.js`): only the page can
 * ring a chime or raise a desktop notification, and only the page knows whether
 * its window is in the foreground. The Host therefore registers nothing; the
 * bundle exists to declare the `dsh.client` module and its display metadata.
 */
export function apply() {}
