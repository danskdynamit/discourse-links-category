import discourseComputed from "discourse-common/utils/decorators";
import { selectedText } from 'discourse/lib/utilities';

// hack startsWith
function startsWith(string, searchString, position) {
  var position = position || 0;
  return string.substr(position, searchString.length) === searchString;
}

export default Ember.Component.extend({
  tagName: 'a',
  classNameBindings: ['url:featured-link:invisible'],
  attributeBindings: ['url:href', 'target', 'rel'],
  rel: 'nofollow',

  @discourseComputed('topic.featuredLink', 'link')
  url(featuredLink, link) {
    return featuredLink || link;
  },

  @discourseComputed('url')
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

  @discourseComputed('url')
  target(url) {
    return this.siteSettings.links_category_open_in_external_tab ? '_blank' : null;
  }
});
