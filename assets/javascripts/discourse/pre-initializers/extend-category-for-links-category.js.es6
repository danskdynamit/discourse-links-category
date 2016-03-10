import property from 'ember-addons/ember-computed-decorators';
import Category from 'discourse/models/category';

export default {
  name: 'extend-category-for-links-category',
  before: 'inject-discourse-objects',
  initialize() {

    Category.reopen({
      @property('custom_fields.enable_links_category')
      enable_links_category: {
        get(enableField) {
          console.log(this, enableField);
          return enableField === "true";
        },
        set(value) {
          value = value ? "true" : "false";
          this.set("custom_fields.enable_links_category", value);
          return value;
        }
      }

    });
  }
};
