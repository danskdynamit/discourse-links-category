import { createWidget } from 'discourse/widgets/widget';
import { h } from 'virtual-dom';
import { selectedText } from 'discourse/lib/utilities';

// hack startsWith
function startsWith(string, searchString, position) {
  var position = position || 0;
  return string.substr(position, searchString.length) === searchString;
}

export default createWidget('featured-link', {
  html(attrs) {
    let featuredURL = attrs.topic.featured_link;

    if (this.siteSettings.links_category_url_ref && featuredURL) {
      const connector = featuredURL.indexOf('?') === -1 ? '?' : '&';
      featuredURL = `${featuredURL}${connector}ref=${this.siteSettings.links_category_url_ref}`;
    }

    if (attrs.topic && featuredURL) {
      let domain = featuredURL;
      if (domain.indexOf("://") > -1) {
        domain = domain.split('/')[2];
      } else {
        domain = domain.split('/')[0];
      }

      domain = domain.split(':')[0];

      // www is too frequent, truncate it
      if (domain && startsWith(domain, 'www.')) {
        domain = domain.replace('www\.', '');
      }

      return h('a.featured-link', {
        attributes: { href: featuredURL, rel: 'nofollow', target: this.siteSettings.links_category_open_in_external_tab ? '_blank' : null }
      }, domain);
    }
  }
});
