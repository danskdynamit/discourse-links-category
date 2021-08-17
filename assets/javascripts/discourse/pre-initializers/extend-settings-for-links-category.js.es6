import discourseComputed from "discourse-common/utils/decorators";
import Category from 'discourse/models/category';

export default {
  name: 'extend-settings-for-links-category',
  before: 'inject-discourse-objects',
  initialize() {

    Category.reopen({
      @discourseComputed('custom_fields.links_category')
      links_category: {
        get(enableField) {
          return enableField === "true";
        },
        set(value) {
          value = value ? "true" : "false";
          this.set("custom_fields.links_category", value);
          return value;
        }
      }

    });
  }
};
