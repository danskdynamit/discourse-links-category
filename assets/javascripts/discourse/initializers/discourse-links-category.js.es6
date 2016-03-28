import PostView from 'discourse/views/post';
import PostMenuComponent from 'discourse/components/post-menu';
import { Button } from 'discourse/components/post-menu';
import ComposerEditor from 'discourse/components/composer-editor';
import Topic from 'discourse/models/topic';
import User from 'discourse/models/user';
import registerUnbound from 'discourse/helpers/register-unbound';
import TopicStatus from 'discourse/views/topic-status';
import { popupAjaxError } from 'discourse/lib/ajax-error';
import TopicController from 'discourse/controllers/topic';
import ComposerController from 'discourse/controllers/composer';
import Composer from 'discourse/models/composer';
import ComposerView from 'discourse/views/composer';
import Category from 'discourse/models/category';
import { withPluginApi } from 'discourse/lib/plugin-api';
import { default as computed, on, observes } from 'ember-addons/ember-computed-decorators';
import afterTransition from 'discourse/lib/after-transition';
import positioningWorkaround from 'discourse/lib/safari-hacks';
import { headerHeight } from 'discourse/views/header';
import isURL from '../../lib/validator-js/isURL';
import PostAdapter from 'discourse/adapters/post';
import { Result } from 'discourse/adapters/rest';
import CategoryChooser from 'discourse/components/category-chooser';
import ClickTrack from 'discourse/lib/click-track';
import ApplicationView from 'discourse/views/application';

function initializeWithApi(api) {
  api.decorateCooked(($elem, m) => {
    if (!m || !$elem) { return }

    const model = m.getModel();
    if (model.get('firstPost') &&
      Discourse.Site.current().get('links_category_ids').contains(model.get('topic.category.id'))) {
      $elem.hide();
    }
  });
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

      //save(force) {
      //  // catch when create topics in link category
      //  // user who type something may lost draft if they try to submit the links (click save button)
      //  console.log(this);
      //  if (this.get('model.canEditFeaturedLink')) {
      //    // Clear the warning state if we're not showing the checkbox anymore
      //    if (!this.get('showWarning')) {
      //      this.set('model.isWarning', false);
      //    }
      //
      //    const composer = this.get('model');
      //    const self = this;
      //
      //    if (composer.get('cantSubmitPost')) {
      //      this.set('lastValidatedAt', Date.now());
      //      return;
      //    }
      //
      //    composer.set('disableDrafts', true);
      //
      //    var staged = false;
      //
      //    const promise = composer.saveFeaturedLinkTopic({ editReason: this.get("editReason")}).then(function(result) {
      //      if (result.responseJson.action === "enqueued") {
      //        self.send('postWasEnqueued', result.responseJson);
      //        self.destroyDraft();
      //        self.close();
      //        self.appEvents.trigger('post-stream:refresh');
      //        return result;
      //      }
      //
      //      // If user "created a new topic/post" or "replied as a new topic" successfully, remove the draft.
      //      if (result.responseJson.action === "create_post" || self.get('replyAsNewTopicDraft')) {
      //        self.destroyDraft();
      //      }
      //      if (self.get('model.action') === 'edit') {
      //        self.appEvents.trigger('post-stream:refresh', { id: parseInt(result.responseJson.id) });
      //      } else {
      //        self.appEvents.trigger('post-stream:refresh');
      //      }
      //
      //      if (result.responseJson.action === "create_post") {
      //        self.appEvents.trigger('post:highlight', result.payload.post_number);
      //      }
      //      self.close();
      //
      //      const currentUser = Discourse.User.current();
      //      if (composer.get('creatingTopic')) {
      //        currentUser.set('topic_count', currentUser.get('topic_count') + 1);
      //      } else {
      //        currentUser.set('reply_count', currentUser.get('reply_count') + 1);
      //      }
      //
      //      const disableJumpReply = Discourse.User.currentProp('disable_jump_reply');
      //      if (!composer.get('replyingToTopic') || !disableJumpReply) {
      //        const post = result.target;
      //        if (post && !staged) {
      //          DiscourseURL.routeTo(post.get('url'));
      //        }
      //      }
      //
      //    }).catch(function(error) {
      //      composer.set('disableDrafts', false);
      //      self.appEvents.one('composer:opened', () => bootbox.alert(error));
      //    });
      //
      //    if (this.get('controllers.application.currentRouteName').split('.')[0] === 'topic' &&
      //      composer.get('topic.id') === this.get('controllers.topic.model.id')) {
      //      staged = composer.get('stagedPost');
      //    }
      //
      //    this.appEvents.trigger('post-stream:posted', staged);
      //
      //    this.messageBus.pause();
      //    promise.finally(() => this.messageBus.resume());
      //
      //    return promise;
      //  } else {
      //    // default behaviour
      //    return this._super(force);
      //  }
      //}
    });

    Composer.serializeOnCreate('featured_link');
    Composer.serializeToTopic('featured_link', 'topic.featured_link');
    Composer.reopen({
      @computed('canEditTitle', 'categoryId')
      canEditFeaturedLink(canEditTitle, categoryId) {
        return canEditTitle &&
          this.site.get('links_category_ids').contains(categoryId);
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

    //  saveFeaturedLinkTopic(opts) {
    //    const post = this.get('post'),
    //      topic = this.get('topic'),
    //      user = this.user,
    //      postStream = this.get('topic.postStream');
    //
    //    let addedToStream = false;
    //
    //    const postTypes = this.site.get('post_types');
    //    const postType = this.get('whisper') ? postTypes.whisper : postTypes.regular;
    //
    //    // Build the post object
    //    const createdPost = this.store.createRecord('post', {
    //      imageSizes: opts.imageSizes,
    //      cooked: this.getCookedHtml(),
    //      reply_count: 0,
    //      name: user.get('name'),
    //      display_username: user.get('name'),
    //      username: user.get('username'),
    //      user_id: user.get('id'),
    //      user_title: user.get('title'),
    //      avatar_template: user.get('avatar_template'),
    //      user_custom_fields: user.get('custom_fields'),
    //      post_type: postType,
    //      actions_summary: [],
    //      moderator: user.get('moderator'),
    //      admin: user.get('admin'),
    //      yours: true,
    //      read: true,
    //      wiki: false,
    //      typingTime: this.get('typingTime'),
    //      composerTime: this.get('composerTime')
    //    });
    //
    //    this.serialize(_create_serializer, createdPost);
    //
    //    if (post) {
    //      createdPost.setProperties({
    //        reply_to_post_number: post.get('post_number'),
    //        reply_to_user: {
    //          username: post.get('username'),
    //          avatar_template: post.get('avatar_template')
    //        }
    //      });
    //    }
    //
    //    let state = null;
    //
    //    // If we're in a topic, we can append the post instantly.
    //    if (postStream) {
    //      // If it's in reply to another post, increase the reply count
    //      if (post) {
    //        post.set('reply_count', (post.get('reply_count') || 0) + 1);
    //        post.set('replies', []);
    //      }
    //
    //      // We do not stage posts in mobile view, we do not have the "cooked"
    //      // Furthermore calculating cooked is very complicated, especially since
    //      // we would need to handle oneboxes and other bits that are not even in the
    //      // engine, staging will just cause a blank post to render
    //      if (!_.isEmpty(createdPost.get('cooked'))) {
    //        state = postStream.stagePost(createdPost, user);
    //        if (state === "alreadyStaging") {
    //          return;
    //        }
    //      }
    //    }
    //
    //  }
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

    ComposerEditor.reopen({
      classNameBindings: ['showToolbar:toolbar-visible', ':wmd-controls', 'showPreview', 'showPreview::hide-preview', 'editLinksCategory:edit-links-category'],

      editLinksCategory: Em.computed.equal('composer.canEditFeaturedLink', true),

      @on('didInsertElement')
      _resizingForFeaturedLink() {
        const $replyControl = $('#reply-control');

        if (this.get('editLinksCategory')) {
          $replyControl.DivResizer({
            maxHeight: winHeight => winHeight - headerHeight(),
            onDrag: sizePx => this.movePanels(sizePx)
          });

          afterTransition($replyControl);
        }
      }
    });

    ComposerView.reopen({
      @observes('composer.canEditFeaturedLink')
      resizeWhenEditFeaturedLink() {
        if (this.get('composer.canEditFeaturedLink')) {
          Ember.run.scheduleOnce('afterRender', () => {
            var h = $('#reply-control').height() || 0;
            const textField = $('.edit-links-category');
            const textFieldHeight = textField ? textField.height() : 0;

            if (h > 0) h -= textFieldHeight;
            this.movePanels(h + "px");
          });
        } else {
          this.resize();
        }
      }
    });

    Topic.reopen({
      @computed('featured_link')
      featuredLinkDomain(url) {
        var domain = url;

        if (url) {
          // remove protocol
          if (url.indexOf("://") > -1) {
            domain = url.split('/')[2];
          } else {
            domain = url.split('/')[0];
          }

          // find & remove port number
          domain = domain.split(':')[0];
        }

        return domain;
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
          return ClickTrack.trackClick(e);
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
