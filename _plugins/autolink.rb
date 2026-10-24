# _plugins/autolink.rb
# Делает голые http/https URL кликабельными после рендеринга Markdown → HTML.
Jekyll::Hooks.register [:pages, :posts, :documents], :post_render do |doc|
  html = doc.output

  # Заменяем только URL-ы, которые не уже внутри <a ...>...</a> и не в атрибутах.
  # В адрес не берём кавычки и «>» (иначе в ссылке вида [текст](https://web.archive.org/web/…/https://site/…)
  # вторая часть адреса съедала «">текст» и ломала href — пост 20627), и не трогаем URL,
  # вложенный в другой адрес (перед ним «/» или «=»).
  html.gsub!(/(?<!["'>\/=])(https?:\/\/[^\s<>"')]+)(?![^<]*>)/) do |m|
    href = m
    # Отсекаем завершающую пунктуацию за границами URL (.,!?:) — если есть
    trail = ""
    if href =~ /[.,!?):]+$/
      trail = href[/[.,!?):]+$/]
      href = href.sub(/[.,!?):]+$/, '')
    end
    %Q{<a href="#{href}" rel="nofollow ugc" target="_blank">#{href}</a>} + trail
  end

  doc.output = html
end
