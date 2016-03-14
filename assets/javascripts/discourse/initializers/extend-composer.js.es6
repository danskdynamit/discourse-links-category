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

function initializeWithApi(api) {
}

/* From validator.js: https://github.com/chriso/validator.js */
function isURL(str) {
  var urlRegex = '^(?!mailto:)(?:(?:http|https|ftp)://)(?:\\S+(?::\\S*)?@)?(?:(?:(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}(?:\\.(?:[0-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))|(?:(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)(?:\\.(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)*(?:\\.(?:[a-z\\u00a1-\\uffff]{2,})))|localhost)(?::\\d{2,5})?(?:(/|\\?|#)[^\\s]*)?$';
  var url = new RegExp(urlRegex, 'i');
  return str.length < 2083 && url.test(str);
}

export default {
  name: 'extend-composer',
  initialize() {
    TopicController.reopen({
      canEditFeaturedLink: function() {
        return !this.get('model.isPrivateMessage');
      }.property('model.isPrivateMessage')
    });

    ComposerController.reopen({
      featuredLinkPlaceholder: I18n.t("linksCategory.link.placeholder"),

      @computed('model.featuredLink', 'lastValidatedAt', 'featuredLinkValid')
      featuredLinkValidation(link, lastValidatedAt, featuredLinkValid) {
        //console.log(this.get('model.reply'), link);
        //console.log(Ember.isEmpty(link), link && isURL(link));

        let reason;
        if (Ember.isEmpty(link)) {
          reason = I18n.t('linksCategory.link.error.link_missing');
        } else if (!isURL(link)) {
          reason = I18n.t('linksCategory.link.error.invalid');
        }

        if (reason) {
          return Discourse.InputValidation.create({ failed: true, reason, lastShownAt: lastValidatedAt });
        }
      },

      @computed('model.featuredLink')
      featuredLinkValid(link) {
        return !Ember.isEmpty(link) && isURL(link);
      },

      save(force) {
        // catch when create topics in link category
        // user who type something may lost draft if they try to submit the links (click save button)
        console.log(this);
        if (this.get('model.canEditFeaturedLink')) {
          // Clear the warning state if we're not showing the checkbox anymore
          if (!this.get('showWarning')) {
            this.set('model.isWarning', false);
          }

          // ensure link is valid
          // it's only validation point for the plugin
          if (!this.get('featuredLinkValid')) {
            this.set('lastValidatedAt', Date.now());
            return;
          }

          // forge reply message for validation so we don't need to crack the whole composer
          // should apply to every Discourse site
          // but might fail due to some site settings
          this.set('model.reply', "@" + Discourse.User.current().username + " submitted link " +
            this.get('model.featuredLink') + " for " + this.get('model.title'));
          console.log(this);
        }

        // default behaviour
        return this._super(force);
      }
    });

    Composer.reopen({
      canEditFeaturedLink: function() {
        console.log(this);
        return this.get('canEditTitle') &&
          this.site.get('links_category_ids').contains(this.get('categoryId'));
      }.property('canEditTitle', 'categoryId')
    });

    ComposerEditor.reopen({
      classNameBindings: ['showToolbar:toolbar-visible', ':wmd-controls', 'showPreview', 'showPreview::hide-preview', 'editLinksCategory:edit-links-category'],

      editLinksCategory: Em.computed.equal('composer.canEditFeaturedLink', true),

      @on('didInsertElement')
      _resizingForFeaturedLink() {
        console.log(this);
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
      featuredLink: 'http://images.google.com',
      featuredLinkDomain: 'images.google.com'
    });

    withPluginApi('0.1', initializeWithApi);
  }
};
