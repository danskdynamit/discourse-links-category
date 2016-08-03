import { createWidget } from 'discourse/widgets/widget';
import { h } from 'virtual-dom';
import { selectedText } from 'discourse/lib/utilities';

// hack startsWith
function startsWith(string, searchString, position) {
  let position = position || 0;
  return string.substr(position, searchString.length) === searchString;
}

export default createWidget('featured-link', {
  html(attrs) {
    const featuredURL = attrs.topic.featured_link;

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
        attributes: { href: featuredURL, rel: 'nofollow' }
      }, domain);
    }
  },

  click(e) {
    if (selectedText() !== "") { return false; }

    e.preventDefault();

    if (this.siteSettings.links_category_open_in_external_tab) {
      let win = window.open(this.get('url'), '_blank');
      win.focus();
    } else {
      window.location = this.get('url');
    }

    return false;
  }
});
