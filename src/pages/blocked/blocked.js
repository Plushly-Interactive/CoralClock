const params = new URLSearchParams(location.search);
const site = params.get('site');
const path = params.get('path');
const target = site && path ? `${site}/${path}` : site;
if (target) {
  document.querySelector('#msg').textContent = `You've reached your limit on ${target}.`;
}
