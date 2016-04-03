import { Button } from 'discourse/components/post-menu';
import Topic from 'discourse/models/topic';
import ComposerController from 'discourse/controllers/composer';
import Composer from 'discourse/models/composer';
import { withPluginApi } from 'discourse/lib/plugin-api';
import { default as computed, on, observes } from 'ember-addons/ember-computed-decorators';
import ComposerView from 'discourse/views/composer';
import ComposerEditor from 'discourse/components/composer-editor';
import afterTransition from 'discourse/lib/after-transition';
import { headerHeight } from 'discourse/views/header';
import isURL from '../../lib/validator-js/isURL';
import PostAdapter from 'discourse/adapters/post';
import { Result } from 'discourse/adapters/rest';
import ClickTrack from 'discourse/lib/click-track';
import ApplicationView from 'discourse/views/application';
import StreamItem from 'discourse/components/stream-item';

function initializeWithApi(api) {
  api.decorateCooked(($elem, m) => {
    if (!m || !$elem) { return }

    const model = m.getModel(),
      categoryIds = Discourse.Site.current().get('links_category_ids');
    if (model.get('firstPost') && categoryIds &&
      categoryIds.contains(model.get('topic.category.id'))) {
      $elem.hide();
    }
  });
}

function extractDomainName(url) {
  if (!url) return;

  if (url.indexOf("://") > -1) {
    url = url.split('/')[2];
  } else {
    url = url.split('/')[0];
  }

  url = url.split(':')[0];

  // www is too frequent
  if (url && url.startsWith('www.')) {
    url = url.replace('www\.', '');
  }

  return url;
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
          return Discourse.InputValidation.create({ failed: true, reason, lastShownAt: lastValidatedAt });
        }
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
        return !Ember.isEmpty(link) && isURL(link, URL_VALIDATOR_CONFIG);
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
          return Discourse.ajax(path, { method: 'POST', data: args }).then(function (json) {
            return new Result(json[typeField], json);
          });
        } else {
          return this._super(store, type, args);
        }
      }
    });

    // TODO: auto resize?
    // ComposerEditor.reopen({
    //   classNameBindings: ['showToolbar:toolbar-visible', ':wmd-controls', 'showPreview', 'showPreview::hide-preview', 'editLinksCategory:edit-links-category'],
    //
    //   editLinksCategory: Em.computed.equal('composer.canEditFeaturedLink', true),
    //
    //   @on('didInsertElement')
    //   _resizingForFeaturedLink() {
    //     const $replyControl = $('#reply-control');
    //
    //     if (this.get('editLinksCategory')) {
    //       $replyControl.DivResizer({
    //         maxHeight: winHeight => winHeight - headerHeight(),
    //         onDrag: sizePx => this.movePanels(sizePx)
    //       });
    //
    //       afterTransition($replyControl);
    //     }
    //   }
    // });
    //
    // ComposerView.reopen({
    //   @observes('composer.canEditFeaturedLink')
    //   resizeWhenEditFeaturedLink() {
    //     if (this.get('composer.canEditFeaturedLink')) {
    //       Ember.run.scheduleOnce('afterRender', () => {
    //         var h = $('#reply-control').height() || 0;
    //         const textField = $('.edit-links-category');
    //         const textFieldHeight = textField ? textField.height() : 0;
    //
    //         if (h > 0) h -= textFieldHeight;
    //         this.movePanels(h + "px");
    //       });
    //     } else {
    //       this.resize();
    //     }
    //   }
    // });

    Topic.reopen({
      @computed('featured_link')
      featuredLinkDomain(url) {
        return extractDomainName(url);
      }
    });

    StreamItem.reopen({
      @computed('item.featured_link')
      featuredLinkDomain(url) {
        return extractDomainName(url);
      }
    });

    ApplicationView.reopen({
      @on('didInsertElement')
      _inserted: function() {
        this.$().on('mouseup.link-category', 'a.featured-link', (e) => {
          // bypass if we are selecting stuff
          const selection = window.getSelection && window.getSelection();
          if (selection.type === "Range" || selection.rangeCount > 0) {
            if (Discourse.Utilities.selectedText() !== "") {
              return true;
            }
          }
          return e;// ClickTrack.trackClick(e);
        });

      },

      @on('willDestroyElement')
      _destroyed() {
        // Unbind link tracking
        this.$().off('mouseup.link-category', 'a.featured-link');
      }
    });

    withPluginApi('0.1', initializeWithApi);
  }
};
