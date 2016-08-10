import Topic from 'discourse/models/topic';
import ComposerController from 'discourse/controllers/composer';
import Composer from 'discourse/models/composer';
import { withPluginApi } from 'discourse/lib/plugin-api';
import { default as computed, on, observes } from 'ember-addons/ember-computed-decorators';
import ComposerView from 'discourse/views/composer';
import isURL from '../../lib/validator-js/isURL';
import PostAdapter from 'discourse/adapters/post';
import { Result } from 'discourse/adapters/rest';
import InputValidation from 'discourse/models/input-validation';
import { ajax } from 'discourse/lib/ajax';

// hack startsWith
function startsWith(string, searchString, position) {
  var position = position || 0;
  return string.substr(position, searchString.length) === searchString;
}

const URL_VALIDATOR_CONFIG = {
  protocols: ['http','https'],
  require_tld: true,
  require_protocol: false,
  require_valid_protocol: true,
  allow_underscores: false,
  host_whitelist: false,
  host_blacklist: false,
  allow_trailing_dot: false,
  allow_protocol_relative_urls: false
};

function oneboxed($elem) {
  return $elem.children('p').children('a').length === 0;
}

function initializeWithApi(api) {
  const siteSettings = api.container.lookup('site-settings:main');

  api.decorateCooked(($elem, m) => {
    if (!m || !$elem) { return }

    const model = m.getModel(),
      categoryIds = Discourse.Site.current().get('links_category_ids');

    // decorate the links topic
    if (model.get('firstPost') && categoryIds && categoryIds.contains(model.get('topic.category.id'))) {
      const siteSettings = api.container.lookup('site-settings:main');

      if (siteSettings.links_category_show_onebox_in_post && oneboxed($elem)) {
        $elem.show();
      } else {
        $elem.hide();
      }
    }
  });

  api.decorateWidget('header-topic-info:after', h => {
    return h.attach('featured-link', h.attrs);
  });

  $('#main').on('click.link-category', 'a.featured-link', e => {
    e.preventDefault();

    const target = $(e.target),
      url = target.attr('href');

    if (siteSettings.links_category_open_in_external_tab) {
      var win = window.open(url, '_blank');
      win.focus();
    } else {
      window.location = url;
    }

    return false;
  });
}

export default {
  name: 'discourse-links-category',
  initialize() {
    ComposerController.reopen({
      featuredLinkPlaceholder: I18n.t("links_category.link.placeholder"),

      @computed('model.featured_link', 'lastValidatedAt', 'model.featuredLinkValid')
      featuredLinkValidation(link, lastValidatedAt, featuredLinkValid) {
        let reason;
        if (Ember.isEmpty(link)) {
          reason = I18n.t('links_category.link.error.link_missing');
        } else if (!isURL(link, URL_VALIDATOR_CONFIG)) {
          reason = I18n.t('links_category.link.error.invalid');
        }

        if (reason) {
          return InputValidation.create({ failed: true, reason, lastShownAt: lastValidatedAt });
        }
      },

      toggle() {
        this.closeAutocomplete();
        switch (this.get('model.composeState')) {
          case Composer.OPEN:
            if (Ember.isEmpty(this.get('model.reply')) && Ember.isEmpty(this.get('model.title')) ||
              Ember.isEmpty(this.get('model.featured_link')) && Ember.isEmpty(this.get('model.title'))) {
              this.close();
            } else {
              this.shrink();
            }
            break;
          case Composer.DRAFT:
            this.set('model.composeState', Composer.OPEN);
            break;
          case Composer.SAVING:
            this.close();
        }
        return false;
      },

      _setModel(composerModel, opts) {
        this._super(composerModel, opts);

        if (opts.draft && this.get('model') && this.get('model.metaData.featured_link')) {
          this.set('model.featured_link', this.get('model.metaData.featured_link'));
        }
      },

      @observes('model.reply', 'model.title', 'model.featured_link')
      _shouldSaveDraft() {
        Ember.run.debounce(this, this._saveDraft, 2000);
      }
    });

    Composer.serializeOnCreate('featured_link');
    Composer.serializeToTopic('featured_link', 'topic.featured_link');
    Composer.reopen({
      @computed('canEditTitle', 'categoryId')
      canEditFeaturedLink(canEditTitle, categoryId) {
        const categoryIds = this.site.get('links_category_ids');
        return canEditTitle && categoryIds &&
          categoryIds.contains(categoryId);
      },

      @computed('featured_link')
      featuredLinkValid(link) {
        const metaData = Ember.Object.create({ featured_link: link });

        this.set('metaData', metaData);
        return !Ember.isEmpty(link) && isURL(link, URL_VALIDATOR_CONFIG);
      },

      @computed('reply', 'originalText', 'metaData')
      replyDirty(reply, originalText, metaData) {
        return reply !== originalText || metaData;
      },

      saveDraft() {
        if (this.get('featured_link') && !this.get('topic'))
          this.set('reply', this.get('featured_link'));

        this._super();
      },

      // whether to disable the post button
      cantSubmitPost: function () {
        // catch when create topics in link category
        if (this.get('canEditFeaturedLink')) {
          // can't submit while loading
          if (this.get('loading')) return true;

          // title is required when
          //  - creating a new topic/private message
          //  - editing the 1st post
          if (this.get('canEditTitle') && !this.get('titleLengthValid')) return true;

          return !this.get('featuredLinkValid');
        } else {
          // default behaviour
          return this._super();
        }
      }.property('loading', 'canEditTitle', 'titleLength', 'targetUsernames', 'replyLength', 'categoryId', 'missingReplyCharacters', 'featured_link'),
    });

    PostAdapter.reopen({
      createRecord(store, type, args) {
        // may validate
        if (args.featured_link) {
          let path = this.basePath(store, type) + 'links_category/links';

          const typeField = Ember.String.underscore(type);
          args.nested_post = true;
          return ajax(path, { method: 'POST', data: args }).then(function (json) {
            return new Result(json[typeField], json);
          });
        } else {
          return this._super(store, type, args);
        }
      }
    });

    Topic.reopen({
      // for raw rendering
      @computed('featured_link')
      featuredLinkDomain(url) {
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
      }
    });

    ComposerView.reopen({
      classNameBindings: ['composer.creatingPrivateMessage:private-message',
                          'composeState',
                          'composer.loading',
                          'composer.canEditTitle:edit-title',
                          'composer.createdPost:created-post',
                          'composer.creatingTopic:topic',
                          'composer.canEditFeaturedLink:edit-link-category']
    });

    withPluginApi('0.3', initializeWithApi);
  }
};
