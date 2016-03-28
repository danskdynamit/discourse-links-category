# name: discourse-links-category
# about: Links category feature on Discourse
# version: 0.3
# authors: Erick Guan (fantasticfears@gmail.com)

PLUGIN_NAME = 'discourse_links_category'.freeze
SETTING_NAME = 'links_category'.freeze
FEATURED_LINK_FIELD_NAME = 'featured_link'.freeze

enabled_site_setting :links_category_enabled

register_asset 'stylesheets/links-category.scss'
#register_asset 'javascripts/discourse/lib/validator.js.es6'

after_initialize do

  module ::DiscourseLinksCategory
    class Engine < ::Rails::Engine
      engine_name PLUGIN_NAME
      isolate_namespace DiscourseLinksCategory
    end
  end

  DiscourseLinksCategory::Engine.routes.draw do
    post '/links' => 'links#create'
  end

  Discourse::Application.routes.append do
    mount ::DiscourseLinksCategory::Engine, at: "/links_category"
  end

  class DiscourseLinksCategory::LinksController < ::PostsController
    requires_plugin PLUGIN_NAME
    before_action :ensure_logged_in, only: [:create]

    def create
      # make sure url is valid
      # copy if raw is blank or even customized

      @params = create_params

      category = @params[:category] || ""
      guardian.ensure_featured_link_category!(category.to_i)


      # fail early to skip post manager if url is invalid
      uri = URI.parse(@params[:featured_link])
      if !uri.kind_of?(URI::HTTP) && !uri.kind_of?(URI::HTTPS)
        result = NewPostResult.new(:create_post)
        result.errors[:base] << 'Link is invalid.'
      else
        # rewrite as featured link unless client can play well with user stream etc.
        @params[:raw] = @params[:featured_link] #  if @params[:raw].blank?
        @params[:skip_validations] = true
        @params[:post_type] ||= Post.types[:regular]
        @params[:first_post_checks] = true

        manager = NewPostManager.new(current_user, @params)
        result = manager.perform
      end

      if result.success?
        result.post.topic.custom_fields = { featured_link: @params[:featured_link] }
        result.post.topic.save!
      end
      json = serialize_data(result, NewPostResultSerializer, root: false)
      backwards_compatible_json(json, result.success?)
    end

    private
    def create_params
      permitted = [
        :raw,
        :featured_link,
        :title,
        :topic_id,
        :archetype,
        :category,
        :auto_track,
        :typing_duration_msecs,
        :composer_open_duration_msecs
      ]

      result = params.permit(*permitted).tap do |whitelisted|
        whitelisted[:image_sizes] = params[:image_sizes]
        # TODO this does not feel right, we should name what meta_data is allowed
        whitelisted[:meta_data] = params[:meta_data]
      end

      PostRevisor.tracked_topic_fields.each_key do |f|
        params.permit(f => [])
        result[f] = params[f] if params.has_key?(f)
      end

      # Stuff we can use in spam prevention plugins
      result[:ip_address] = request.remote_ip
      result[:user_agent] = request.user_agent
      result[:referrer] = request.env["HTTP_REFERER"]

      result
    end
  end

  class ::Category
    after_save :reset_links_categories_cache

    protected
    def reset_links_categories_cache
      ::Guardian.reset_links_categories_cache
    end
  end

  class ::Guardian

    @@allowed_featured_link_categories_cache = DistributedCache.new(SETTING_NAME)

    def self.reset_links_categories_cache
      @@allowed_featured_link_categories_cache["allowed"] =
        begin
          Set.new(
            CategoryCustomField
              .where(name: SETTING_NAME, value: "true")
              .pluck(:category_id)
          )
        end
    end

    def featured_link_category?(category_id)
      self.class.reset_links_categories_cache unless @@allowed_featured_link_categories_cache["allowed"]
      @@allowed_featured_link_categories_cache["allowed"].include?(category_id)
    end
  end

  module ::CategoryBadgeExtension
    def self.html_for(category, opts = nil)
      html = super(category, opts)

    end
  end

  CategoryBadge.class_eval do
    prepend ::CategoryBadgeExtension
  end

  add_to_class(:topic, :featured_link) { custom_fields[FEATURED_LINK_FIELD_NAME] }
  TopicList.preloaded_custom_fields << FEATURED_LINK_FIELD_NAME if TopicList.respond_to? :preloaded_custom_fields

  add_to_serializer(:site, :links_category_ids) { CategoryCustomField.where(name: SETTING_NAME, value: "true").pluck(:category_id) }
  add_to_serializer(:topic_view, :include_featured_link?, false) { scope.featured_link_category?(object.topic.category.id) }
  add_to_serializer(:topic_view, :featured_link, false) { TopicCustomField.where(name: FEATURED_LINK_FIELD_NAME, topic_id: object.topic.id).pluck(:value).first }
  add_to_serializer(:topic_list_item, :include_featured_link?, false) { scope.featured_link_category?(object.category.id) }
  add_to_serializer(:topic_list_item, :featured_link, false) { object.featured_link }
end
