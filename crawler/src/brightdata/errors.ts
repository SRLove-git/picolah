/** Remove zone credentials that Playwright embeds in connection errors. */
export function sanitizeBrightDataError(message: string): string {
  return message.replace(/(brd-customer-[^:\s]+):[^@\s]+@/g, '$1:***@');
}
