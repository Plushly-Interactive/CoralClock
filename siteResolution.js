import { getDomain, getDomainWithoutSuffix } from './tldts.js';

export function resolveSite(hostname) {
  const siteId = getDomain(hostname) ?? hostname;
  const siteLabel = getDomainWithoutSuffix(hostname) ?? hostname;
  return { siteId, siteLabel };
}
