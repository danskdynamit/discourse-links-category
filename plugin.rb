# name: discourse-links-category
# about: Links category feature on Discourse
# version: 1.8
# authors: Erick Guan (fantasticfears@gmail.com)

PLUGIN_NAME = 'discourse_links_category'.freeze
SETTING_NAME = 'links_category'.freeze
FEATURED_LINK_FIELD_NAME = 'featured_link'.freeze

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
    post '/links' => 'links#create'
  end

  Discourse::Application.routes.append do
    mount ::DiscourseLinksCategory::Engine, at: "/links_category"
  end

  class DiscourseLinksCategory::LinksController < ::PostsController
    requires_plugin PLUGIN_NAME
    before_action :ensure_logged_in, only: [:create]

    def create
      @params = create_params

      category = @params[:category] || ""
      guardian.ensure_featured_link_category!(category.to_i)


      uri = URI.parse(@params[:featured_link]) rescue nil
      if uri.nil?
        uri = URI.parse(URI.encode(@params[:featured_link])) rescue nil
      end
      uri = URI('') if uri.nil?
      if uri.scheme.nil?
        uri = URI.parse("http://#{@params[:featured_link]}")
      end

      # fail early to skip post manager if url is invalid
      if !uri.kind_of?(URI::HTTP) && !uri.kind_of?(URI::HTTPS)
        result = NewPostResult.new(:create_post)
        result.errors[:base] << I18n.t('links_category.invalid_link')
      else
        # rewrite as featured link unless client can play well with user stream etc.
        # we need a link appeared in the post since TopicLink extracts the link from the
        # first post. otherwise, we lose the tracking ability
        @params[:raw] = SiteSetting.links_category_show_onebox_in_post ? @params[:featured_link] : ''
        if SiteSetting.links_category_show_onebox_in_post
          Oneboxer.preview(@params[:featured_link], invalidate_oneboxes: false)
        end
        @params[:skip_validations] = true
        @params[:post_type] ||= Post.types[:regular]
        @params[:first_post_checks] = true
        @params[:invalidate_oneboxes] = true

        manager = NewPostManager.new(current_user, @params)
        result = manager.perform
      end

      if result.success?
        result.post.topic.custom_fields = { featured_link: uri.to_s }
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

  if Report.respond_to?(:add_report)
    AdminDashboardData::GLOBAL_REPORTS << FEATURED_LINK_FIELD_NAME

    Report.add_report(FEATURED_LINK_FIELD_NAME) do |report|
      report.data = []
      link_topics = TopicCustomField.where(name: FEATURED_LINK_FIELD_NAME)
      link_topics = link_topics.joins(:topic).where("topics.category_id = ?", report.category_id) if report.category_id
      link_topics.where("topic_custom_fields.created_at >= ?", report.start_date)
                 .where("topic_custom_fields.created_at <= ?", report.end_date)
                 .group("DATE(topic_custom_fields.created_at)")
                 .order("DATE(topic_custom_fields.created_at)")
                 .count
                 .each do |date, count|
        report.data << { x: date, y: count }
      end
      report.total = link_topics.count
      report.prev30Days = link_topics.where("topic_custom_fields.created_at >= ?", report.start_date - 30.days)
                                     .where("topic_custom_fields.created_at <= ?", report.start_date)
                                     .count
    end
  end

  # override category_id block
  PostRevisor.track_topic_field(:category_id) do |tc, category_id|
    unless tc.guardian.is_staff?
      old_category_id = tc.topic.category.id

      # move topic out of links category
      if tc.guardian.featured_link_category?(old_category_id)
        tc.topic.errors[:base] << I18n.t("links_category.topic_moved_out_disallowed")
        tc.check_result(false)
        next
      end

      # move topic to links category
      if tc.guardian.featured_link_category?(category_id)
        tc.topic.errors[:base] << I18n.t("links_category.topic_moved_in_disallowed")
        tc.check_result(false)
        next
      end
    end

    tc.record_change('category_id', tc.topic.category_id, category_id)
    tc.check_result(tc.topic.change_category_to_id(category_id))
  end

  PostRevisor.track_topic_field(:featured_link) do |tc, featured_link|
    if SiteSetting.links_category_enabled && featured_link.present? && tc.guardian.featured_link_category?(tc.topic.category_id)
      begin
        uri = URI.parse(featured_link) rescue nil
        if uri.nil?
          uri = URI.parse(URI.encode(featured_link)) rescue nil
        end
        uri = URI('') if uri.nil?
        if uri.scheme.nil?
          uri = URI.parse("http://#{featured_link}")
        end

        # fail early to skip post manager if url is invalid
        if !uri.kind_of?(URI::HTTP) && !uri.kind_of?(URI::HTTPS)
          tc.topic.errors[:base] << I18n.t('links_category.invalid_link')
          tc.check_result(false)
          next
        else
          tc.topic.custom_fields['featured_link'] = featured_link
          tc.topic.save!
        end
      rescue
        tc.topic.errors[:base] << I18n.t('links_category.invalid_link')
        tc.check_result(false)
      end
    end
  end

  ApplicationHelper.class_eval do
    def featured_link_domain(url)
      uri = URI.parse(url)
      uri = URI.parse("http://#{url}") if uri.scheme.nil?
      host = uri.host.downcase
      host.start_with?('www.') ? host[4..-1] : host
    end
  end

  add_to_class(:topic, :featured_link) { custom_fields[FEATURED_LINK_FIELD_NAME] }
  TopicList.preloaded_custom_fields << FEATURED_LINK_FIELD_NAME if TopicList.respond_to? :preloaded_custom_fields

  add_to_serializer(:site, :links_category_ids) { CategoryCustomField.where(name: SETTING_NAME, value: "true").pluck(:category_id) }
  add_to_serializer(:topic_view, :include_featured_link?, false) { object.topic.category && scope.featured_link_category?(object.topic.category.id) }
  add_to_serializer(:topic_view, :featured_link, false) { TopicCustomField.where(name: FEATURED_LINK_FIELD_NAME, topic_id: object.topic.id).pluck(:value).first }
  add_to_serializer(:topic_list_item, :include_featured_link?, false) { object.category && scope.featured_link_category?(object.category.id) }
  add_to_serializer(:topic_list_item, :featured_link, false) { object.featured_link }
  add_to_serializer(:suggested_topic, :include_featured_link?, false) { object.category && scope.featured_link_category?(object.category.id) }
  add_to_serializer(:suggested_topic, :featured_link, false) { object.featured_link }
  add_to_serializer(:user_action, :include_featured_link?, false) { object.category_id && scope.featured_link_category?(object.category_id) }
  add_to_serializer(:user_action, :featured_link, false) { TopicCustomField.where(name: FEATURED_LINK_FIELD_NAME, topic_id: object.topic_id).pluck(:value).first }

  UserNotifications.prepend_view_path("#{File.dirname(__FILE__)}/app/views")
  Email::Styles.register_plugin_style do |fragment|
    fragment.css("a.featured-link").each do |e|
      e['style'] = SiteSetting.links_category_digest_email_anchor_style
    end
  end
end
