import { createWidget } from 'discourse/widgets/widget';
import { h } from 'virtual-dom';

export default createWidget('featured-link', {
  html(attrs) {
    if (attrs.topic && attrs.topic.featured_link) {
      var url = attrs.topic.featured_link;
      if (url.indexOf("://") > -1) {
        url = url.split('/')[2];
      } else {
        url = url.split('/')[0];
      }

      url = url.split(':')[0];

      // www is too frequent, truncate it
      if (url && url.startsWith('www.')) {
        url = url.replace('www\.', '');
      }

      return h('a.featured-link', {
        attributes: { href: attrs.topic.featured_link }
      }, url);
    }
  },

  click(e) {
    if (Discourse.Utilities.selectedText() !== "") { return false; }

    e.preventDefault();

    if (this.siteSettings.links_category_open_in_external_tab) {
      var win = window.open(this.get('url'), '_blank');
      win.focus();
    } else {
      window.location = this.get('url');
    }

    return false;  }
});
