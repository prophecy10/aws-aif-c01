/* config.js — site settings */
const SITE = {
  // Name shown on the share card
  title: 'AIF-C01 Practice',
  // GitHub repo, used for the "report a mistake" link on every explanation
  repo: 'https://github.com/prophecy10/aws-aif-c01',
  // Private visit counter (GoatCounter: free, no cookies, no personal data). Leave empty to disable.
  goatcounter: ''
};

if (SITE.goatcounter && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = `https://${SITE.goatcounter}.goatcounter.com/count`;
  document.head.appendChild(s);
}
