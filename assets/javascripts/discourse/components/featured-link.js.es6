import computed from 'ember-addons/ember-computed-decorators';
import { observes, on } from 'ember-addons/ember-computed-decorators';
import StringBuffer from 'discourse/mixins/string-buffer';
import { selectedText } from 'discourse/lib/utilities';

// hack startsWith
function startsWith(string, searchString, position) {
  var position = position || 0;
  return string.substr(position, searchString.length) === searchString;
}

export default Ember.Component.extend(StringBuffer, {
  tagName: 'a',
  classNameBindings: ['url:featured-link:invisible'],
  attributeBindings: ['url:href'],

  renderString(buffer) {
    buffer.push(this.get('domain'));
  },

  @computed('topic.featured_link', 'link')
  url(featuredLink, link) {
    return featuredLink || link;
  },

  @computed('url')
  urlExist(url) {
    return url && url.length !== 0;
  },

  @computed('url')
  domain(url) {
    if (!url) return '';

    if (url.indexOf("://") > -1) {
      url = url.split('/')[2];
    } else {
      url = url.split('/')[0];
    }

    url = url.split(':')[0];

    // www is too frequent, truncate it
    if (url && startsWith(url, 'www.')) {
      url = url.replace('www\.', '');
    }

    return url;
  },

  click(e) {
    // cancel click if triggered as part of selection.
    if (selectedText() !== "") { return false; }

    e.preventDefault();

    if (this.siteSettings.links_category_open_in_external_tab) {
      var win = window.open(this.get('url'), '_blank');
      win.focus();
    } else {
      window.location = this.get('url');
    }

    return false;
  }
});
