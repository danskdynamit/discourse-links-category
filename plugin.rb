# name: discourse-links-category
# about: Links category feature on Discourse
# version: 0.1
# authors: Erick Guan (fantasticfears@gmail.com)

PLUGIN_NAME = "links_category".freeze

enabled_site_setting :links_category_enabled

register_asset 'stylesheets/links-category.scss'

after_initialize do

  module ::DiscourseLinksCategory
    class Engine < ::Rails::Engine
      engine_name PLUGIN_NAME
      isolate_namespace DiscourseLinksCategory
    end
  end

  DiscourseLinksCategory::Engine.routes.draw do

  end

  class ::Category
    after_save :reset_links_categories_cache

    protected
    def reset_links_categories_cache
      ::Guardian.reset_links_categories_cache
    end
  end

  class ::Guardian

    @@allowed_links_categories_cache = DistributedCache.new("allowed_links_category")

    def self.reset_links_categories_cache
      @@allowed_links_categories_cache["allowed"] =
        begin
          Set.new(
            CategoryCustomField
              .where(name: "enable_links_category", value: "true")
              .pluck(:category_id)
          )
        end
    end

    def allow_links_categories_on_category?(category_id)
      self.class.reset_links_categories_cache unless @@allowed_links_categories_cache["allowed"]
      @@allowed_links_categories_cache["allowed"].include?(category_id)
    end

    def can_create_link_topic?(topic)
      allow_links_categories_on_category?(topic.category_id) && (
        is_staff? || (
          authenticated? && !topic.closed? && topic.user_id == current_user.id
        )
      )
    end
  end

  add_to_serializer(:site, :links_category_ids) { CategoryCustomField.where(name: "enable_links_category", value: "true").pluck(:category_id) }
end
