require "cgi"
require "fileutils"

module Jekyll
  class GeneratedStaticFile < StaticFile
    def initialize(site, dir, name, content)
      @site = site
      @base = site.source
      @dir = dir
      @name = name
      @content = content
      @relative_path = File.join(@dir, @name)
      @extname = File.extname(@name)
    end

    def modified?
      true
    end

    def write(dest)
      destination_path = destination(dest)
      FileUtils.mkdir_p(File.dirname(destination_path))
      File.write(destination_path, @content)
      Jekyll.logger.info "SitemapIndex:", "wrote #{destination_path}"
      true
    end
  end

  class SitemapIndexGenerator < Generator
    safe true
    priority :lowest

    PER_FILE = 1000

    def generate(site)
      entries = sitemap_entries(site)
      Jekyll.logger.info "SitemapIndex:", "collected #{entries.length} entries"
      return if entries.empty?

      chunks = entries.each_slice(PER_FILE).to_a
      Jekyll.logger.info "SitemapIndex:", "building #{chunks.length} sitemap files"

      chunks.each_with_index do |chunk, index|
        site.static_files << GeneratedStaticFile.new(
          site,
          "sitemap",
          "#{index + 1}.xml",
          build_urlset(chunk)
        )
      end

      site.static_files << GeneratedStaticFile.new(
        site,
        "",
        "sitemap.xml",
        build_sitemap_index(site, chunks)
      )
      Jekyll.logger.info "SitemapIndex:", "queued sitemap.xml and child sitemaps"
    end

    private

    def sitemap_entries(site)
      docs = []

      site.posts.docs.each { |doc| docs << entry_for(site, doc) }
      site.pages.each { |page| docs << entry_for(site, page) }
      site.collections.each_value do |collection|
        next if collection.label == "posts"

        collection.docs.each { |doc| docs << entry_for(site, doc) }
      end

      docs.compact.uniq { |entry| entry[:loc] }.sort_by { |entry| entry[:loc] }
    end

    def entry_for(site, doc)
      return unless include_in_sitemap?(doc)
      return unless html_like?(doc)

      url = doc.url.to_s
      return if url.empty?
      return if url.start_with?("/sitemap")
      return if paginated?(doc, url)

      {
        loc: absolute_url(site, url),
        lastmod: last_modified(doc)
      }
    end

    def include_in_sitemap?(doc)
      return false if doc.data["sitemap"] == false
      return false if doc.data["published"] == false

      true
    end

    def html_like?(doc)
      path = if doc.respond_to?(:path)
        doc.path
      elsif doc.respond_to?(:name)
        doc.name
      else
        ""
      end

      ext = File.extname(path.to_s).downcase
      ext.empty? || ext == ".html" || ext == ".md" || ext == ".markdown"
    end

    def paginated?(doc, url)
      pager = doc.respond_to?(:pager) ? doc.pager : nil
      return true if pager && pager.respond_to?(:page) && pager.page.to_i > 1
      return true if doc.data["paginator"] || doc.data["pagination"]
      return true if url.match?(%r{^/page\d+/?$})
      return true if url.match?(%r{^/page\d+/index\.html$})

      false
    end

    def absolute_url(site, url)
      site.config["url"].to_s.sub(%r{/*$}, "") + url
    end

    def last_modified(doc)
      value =
        if doc.respond_to?(:date) && doc.date
          doc.date
        elsif doc.respond_to?(:data) && doc.data["last_modified_at"]
          doc.data["last_modified_at"]
        end

      value.respond_to?(:xmlschema) ? value.xmlschema : nil
    end

    def build_urlset(entries)
      body = entries.map do |entry|
        lines = ["<url>", "<loc>#{xml_escape(entry[:loc])}</loc>"]
        lines << "<lastmod>#{xml_escape(entry[:lastmod])}</lastmod>" if entry[:lastmod]
        lines << "</url>"
        lines.join("\n")
      end.join("\n")

      <<~XML
        <?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd" xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        #{body}
        </urlset>
      XML
    end

    def build_sitemap_index(site, chunks)
      body = chunks.each_with_index.map do |chunk, index|
        lines = ["<sitemap>"]
        lines << "<loc>#{xml_escape(absolute_url(site, "/sitemap/#{index + 1}.xml"))}</loc>"

        latest = chunk.map { |entry| entry[:lastmod] }.compact.max
        lines << "<lastmod>#{xml_escape(latest)}</lastmod>" if latest
        lines << "</sitemap>"
        lines.join("\n")
      end.join("\n")

      <<~XML
        <?xml version="1.0" encoding="UTF-8"?>
        <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        #{body}
        </sitemapindex>
      XML
    end

    def xml_escape(value)
      CGI.escapeHTML(value.to_s)
    end
  end
end
