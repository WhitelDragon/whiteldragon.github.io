package tools;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * VkFix utility.
 *
 * Modes:
 *   --mode=tag-vk                  (default) wrap any VK links into <a class="vk-attach">...</a>
 *                                  and remove single-word labels like "Fotografiya"/"Video"/"Audio" (ru).
 *   --mode=replace-with-includes   replace VK placeholders with {% include media.html f="..." %}
 *                                  using files found under /assets/img/<year>/<slug>/.
 *
 * Other flags:
 *   --repo=.                       repository root
 *   --apply                        write changes (otherwise dry-run)
 *   --disable-vkjs                 comment out vk-photos.js include in _layouts/default.html
 *
 * Usage examples (from repo root):
 *   javac tools/VkFix.java
 *   java -cp . tools.VkFix --repo=.                  (dry run)
 *   java -cp . tools.VkFix --repo=. --apply          (apply mode tag-vk)
 *   java -cp . tools.VkFix --repo=. --apply --mode=replace-with-includes
 *   java -cp . tools.VkFix --repo=. --apply --disable-vkjs
 */
public class VkFix {

    enum Mode { TAG_VK, REPLACE_WITH_INCLUDES }

    private static Path repo;
    private static boolean apply;
    private static boolean disableVkJs;
    private static Mode mode;

    // front matter helpers
    private static final Pattern FM_DATE = Pattern.compile("(?m)^date:\\s*([0-9]{4})-([0-9]{2})-([0-9]{2})");
    private static final Pattern FILE_NAME_DATE_SLUG = Pattern.compile("^(\\d{4})-(\\d{2})-(\\d{2})-(.+)\\.(md|markdown)$", Pattern.CASE_INSENSITIVE);

    // VK links / placeholders
    private static final Pattern VK_RAW_URL = Pattern.compile("https?://(?:m\\.)?vk\\.com/\\S+");
    private static final Pattern VK_RAW_URL_LINE = Pattern.compile("(?m)^\\s*(https?://(?:m\\.)?vk\\.com/\\S+)\\s*$");
    private static final Pattern VK_MD_LINK = Pattern.compile("\\[([^\\]]*?)\\]\\((https?://(?:m\\.)?vk\\.com/[^)]+)\\)");
    // Russian single-word labels that often precede links in imported posts (ASCII only here):
    private static final Pattern RU_LABEL_LINE = Pattern.compile("(?mi)^(?:Fotografiya|Video|Audio|Фотография|Видео|Аудио)\\s*$");

    private static final String INCLUDE_FMT = "{% include media.html f=\"%s\" %}";

    public static void main(String[] args) throws Exception {
        Map<String,String> a = parseArgs(args);
        repo = Paths.get(a.getOrDefault("repo",".")).toAbsolutePath().normalize();
        apply = a.containsKey("apply");
        disableVkJs = a.containsKey("disable-vkjs");
        String m = a.getOrDefault("mode","tag-vk").toLowerCase(Locale.ROOT);
        mode = m.equals("replace-with-includes") ? Mode.REPLACE_WITH_INCLUDES : Mode.TAG_VK;

        System.out.println("Repo:   " + repo);
        System.out.println("Mode:   " + mode);
        System.out.println("Apply:  " + apply);
        if (disableVkJs) System.out.println("Extra:  disable vk-photos.js");

        List<Path> files = new ArrayList<>();
        files.addAll(collect(repo.resolve("_posts")));
        files.addAll(collect(repo.resolve("_drafts")));

        int changed=0, untouched=0;
        for (Path p : files) {
            String src = read(p);
            String out = (mode == Mode.TAG_VK) ? tagVkLinks(src) : replaceWithIncludes(p, src);
            if (!out.equals(src)) {
                changed++;
                System.out.println("FIX  " + repo.relativize(p));
                if (apply) {
                    Path bak = p.resolveSibling(p.getFileName().toString()+".bak");
                    if (!Files.exists(bak)) write(bak, src);
                    write(p, out);
                }
            } else {
                untouched++;
            }
        }

        if (disableVkJs) {
            Path layout = repo.resolve("_layouts").resolve("default.html");
            if (Files.exists(layout)) {
                String s = read(layout);
                String r = s.replaceAll("(?m)^\\s*<script[^>]*vk-photos\\.js[^>]*>\\s*</script>\\s*$", "<!-- $0 -->");
                if (!r.equals(s)) {
                    System.out.println("DISABLE vk-photos.js in _layouts/default.html");
                    if (apply) write(layout, r);
                } else {
                    System.out.println("vk-photos.js reference not found in _layouts/default.html");
                }
            }
        }

        System.out.printf("%nSummary:%n  changed: %d%n  unchanged: %d%n", changed, untouched);
        if (!apply) System.out.println("\nDry-run only. Re-run with --apply to write changes.");
    }

    private static Map<String,String> parseArgs(String[] args) {
        Map<String,String> m = new HashMap<>();
        for (String s : args) {
            if (s.startsWith("--repo=")) m.put("repo", s.substring(7));
            else if (s.equals("--apply")) m.put("apply","1");
            else if (s.equals("--disable-vkjs")) m.put("disable-vkjs","1");
            else if (s.startsWith("--mode=")) m.put("mode", s.substring(7));
        }
        return m;
    }

    private static List<Path> collect(Path root) throws IOException {
        List<Path> list = new ArrayList<>();
        if (!Files.isDirectory(root)) return list;
        Files.walkFileTree(root, new SimpleFileVisitor<Path>() {
            public FileVisitResult visitFile(Path f, BasicFileAttributes a) {
                String n = f.getFileName().toString().toLowerCase(Locale.ROOT);
                if (n.endsWith(".md") || n.endsWith(".markdown")) list.add(f);
                return FileVisitResult.CONTINUE;
            }
        });
        return list;
    }

    // Mode A: wrap VK links to <a class="vk-attach">...</a> and remove single-word labels.
    private static String tagVkLinks(String src) {
        String s = src;

        // 1) markdown links [text](vk) -> <a class="vk-attach" href="vk">text-or-url</a>
        s = replaceMdVkLinks(s);

        // 2) bare vk url on its own line -> <a class="vk-attach" href="vk">vk</a>
        s = replaceBareVkUrlLines(s);

        // 3) remove standalone labels (Fotografiya/Video/Audio and ru equivalents)
        s = RU_LABEL_LINE.matcher(s).replaceAll("");

        // cleanup extra blanks
        s = s.replaceAll("(?m)^[ \\t]+$", "");
        s = s.replaceAll("(?m)^(?:\\s*\\n){3,}", "\n\n");

        return s;
    }

    private static String replaceMdVkLinks(String s) {
        Matcher m = VK_MD_LINK.matcher(s);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String text = m.group(1);
            String href = m.group(2);
            if (!isVk(href)) { m.appendReplacement(sb, Matcher.quoteReplacement(m.group(0))); continue; }
            String visible = (text == null || text.trim().isEmpty()) ? href : text;
            String repl = "<a class=\"vk-attach\" href=\"" + href + "\">" + visible + "</a>";
            m.appendReplacement(sb, Matcher.quoteReplacement(repl));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    private static String replaceBareVkUrlLines(String s) {
        Matcher m = VK_RAW_URL_LINE.matcher(s);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String href = m.group(1);
            if (!isVk(href)) { m.appendReplacement(sb, Matcher.quoteReplacement(m.group(0))); continue; }
            String repl = "<a class=\"vk-attach\" href=\"" + href + "\">" + href + "</a>";
            m.appendReplacement(sb, Matcher.quoteReplacement(repl));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    // Mode B: replace VK placeholders with include media.html using files in /assets/img/<year>/<slug>/
    private static String replaceWithIncludes(Path file, String src) {
        PostKey key = inferPostKey(file, src);
        if (key == null) return src;

        Path imgDir = repo.resolve(Paths.get("assets","img", String.valueOf(key.year), key.slug));
        if (!Files.isDirectory(imgDir)) return src;

        List<String> imgs = new ArrayList<>();
        try (DirectoryStream<Path> ds = Files.newDirectoryStream(imgDir)) {
            for (Path p : ds) {
                String n = p.getFileName().toString();
                int dot = n.lastIndexOf('.');
                String ext = dot>=0 ? n.substring(dot+1).toLowerCase(Locale.ROOT) : "";
                if (ext.matches("jpg|jpeg|png|webp|gif|avif|svg")) imgs.add(n);
            }
        } catch (IOException ignored) {}
        if (imgs.isEmpty()) return src;
        Collections.sort(imgs);
        Iterator<String> it = imgs.iterator();

        String s = src;

        // 1) [text](vk) -> include (while images available)
        Matcher m1 = VK_MD_LINK.matcher(s);
        StringBuffer sb1 = new StringBuffer();
        while (m1.find()) {
            String href = m1.group(2);
            if (!isVk(href) || !it.hasNext()) {
                m1.appendReplacement(sb1, Matcher.quoteReplacement(m1.group(0)));
            } else {
                String inc = String.format(INCLUDE_FMT, "/assets/img/"+key.year+"/"+key.slug+"/"+it.next());
                m1.appendReplacement(sb1, Matcher.quoteReplacement(inc));
            }
        }
        m1.appendTail(sb1);
        s = sb1.toString();

        // 2) bare vk url line -> include
        Matcher m2 = VK_RAW_URL_LINE.matcher(s);
        StringBuffer sb2 = new StringBuffer();
        while (m2.find()) {
            String href = m2.group(1);
            if (!isVk(href) || !it.hasNext()) {
                m2.appendReplacement(sb2, Matcher.quoteReplacement(m2.group(0)));
            } else {
                String inc = String.format(INCLUDE_FMT, "/assets/img/"+key.year+"/"+key.slug+"/"+it.next());
                m2.appendReplacement(sb2, Matcher.quoteReplacement(inc));
            }
        }
        m2.appendTail(sb2);
        s = sb2.toString();

        // 3) remove labels and cleanup
        s = RU_LABEL_LINE.matcher(s).replaceAll("");
        s = s.replaceAll("(?m)^[ \\t]+$", "");
        s = s.replaceAll("(?m)^(?:\\s*\\n){3,}", "\n\n");

        return s;
    }

    private static boolean isVk(String href) {
        return href != null && href.matches("^https?://(?:m\\.)?vk\\.com/.*");
    }

    static class PostKey { int year; String slug; PostKey(int y, String s){year=y;slug=s;} }

    private static PostKey inferPostKey(Path file, String src) {
        // prefer file name pattern: YYYY-MM-DD-slug.md
        String name = file.getFileName().toString();
        Matcher m = FILE_NAME_DATE_SLUG.matcher(name);
        if (m.find()) {
            int year = Integer.parseInt(m.group(1));
            String slug = m.group(4);
            return new PostKey(year, slug);
        }
        // if no match, try front matter date and fallback slug
        Matcher d = FM_DATE.matcher(src);
        if (d.find()) {
            int y = Integer.parseInt(d.group(1));
            String slug = "post";
            return new PostKey(y, slug);
        }
        return null;
    }

    private static String read(Path p) throws IOException {
        return new String(Files.readAllBytes(p), StandardCharsets.UTF_8);
    }
    private static void write(Path p, String s) throws IOException {
        Files.write(p, s.getBytes(StandardCharsets.UTF_8), StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
    }
}
