package tools;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class VkCleanup {

    private static final Pattern MEDIA_INCLUDE = Pattern.compile("\\{\\%\\s*include\\s+media\\.html\\b");
    private static final Pattern IMG_MD = Pattern.compile("!\\[[^\\]]*\\]\\([^\\)]+\\)");
    private static final Pattern IMG_HTML = Pattern.compile("<img\\b[^>]*>", Pattern.CASE_INSENSITIVE);

    // VK placeholders to remove
    private static final Pattern VK_RAW_URL_LINE = Pattern.compile("^\\s*https?://vk\\.com/\\S+\\s*$", Pattern.MULTILINE);
    private static final Pattern VK_ANCHOR_MD = Pattern.compile("\\[[^\\]]*?Вложение[^\\]]*?]\\(https?://vk\\.com/[^)]+\\)");
    private static final Pattern VK_ANCHOR_HTML = Pattern.compile("<a\\b[^>]*href\\s*=\\s*\"https?://vk\\.com/[^\"]+\"[^>]*>.*?</a>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);

    // Optional label lines before URLs like "Фотография", "Видео", "Аудио"
    private static final Pattern RU_LABEL_LINE = Pattern.compile("(?mi)^(?:Фотография|Видео|Аудио)\\s*$");

    private static final Pattern EXTRA_BLANKS = Pattern.compile("(?m)^(?:\\s*\\n){3,}"); // 3+ пустых строк -> 2

    private static Path repoRoot;
    private static boolean apply = false;
    private static boolean disableVkJs = false;

    public static void main(String[] args) throws IOException {
        Map<String, String> flags = parseArgs(args);
        String repo = flags.getOrDefault("repo", ".");
        apply = flags.containsKey("apply");
        disableVkJs = flags.containsKey("disable-vkjs");

        repoRoot = Paths.get(repo).toAbsolutePath().normalize();
        if (!Files.isDirectory(repoRoot)) {
            System.err.println("Repo directory not found: " + repoRoot);
            System.exit(2);
        }

        System.out.println("Repo: " + repoRoot);
        System.out.println("Mode: " + (apply ? "APPLY" : "DRY-RUN"));
        if (disableVkJs) System.out.println("Also: disable vk-photos.js in layout");

        List<Path> mdFiles = collectMarkdownFiles(repoRoot.resolve("_posts"));
        mdFiles.addAll(collectMarkdownFiles(repoRoot.resolve("_drafts")));

        int touched = 0, skipped = 0, unchanged = 0;
        for (Path md : mdFiles) {
            Result r = processMarkdown(md);
            switch (r.status) {
                case TOUCHED -> touched++;
                case SKIPPED -> skipped++;
                case UNCHANGED -> unchanged++;
            }
        }

        if (disableVkJs) {
            processLayoutForVkJs(repoRoot.resolve("_layouts").resolve("default.html"));
        }

        System.out.printf("%nSummary:%n  changed: %d%n  skipped: %d%n  unchanged: %d%n",
                touched, skipped, unchanged);
        if (!apply) {
            System.out.println("\nDry-run only. Re-run with --apply to write changes.");
        }
    }

    private static Map<String, String> parseArgs(String[] args) {
        Map<String, String> m = new HashMap<>();
        for (String a : args) {
            if (a.startsWith("--repo=")) {
                m.put("repo", a.substring("--repo=".length()));
            } else if (a.equals("--apply")) {
                m.put("apply", "1");
            } else if (a.equals("--disable-vkjs")) {
                m.put("disable-vkjs", "1");
            }
        }
        return m;
    }

    private static List<Path> collectMarkdownFiles(Path root) throws IOException {
        List<Path> out = new ArrayList<>();
        if (!Files.isDirectory(root)) return out;
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                String n = file.getFileName().toString().toLowerCase(Locale.ROOT);
                if (n.endsWith(".md") || n.endsWith(".markdown")) out.add(file);
                return FileVisitResult.CONTINUE;
            }
        });
        return out;
    }

    enum Status { TOUCHED, SKIPPED, UNCHANGED }

    static class Result {
        final Status status;
        Result(Status s){ this.status = s; }
    }

    private static Result processMarkdown(Path md) throws IOException {
        String src = Files.readString(md, StandardCharsets.UTF_8);

        boolean hasRealMedia = MEDIA_INCLUDE.matcher(src).find()
                || IMG_MD.matcher(src).find()
                || IMG_HTML.matcher(src).find();

        boolean hasVkPlaceholders = VK_RAW_URL_LINE.matcher(src).find()
                || VK_ANCHOR_MD.matcher(src).find()
                || VK_ANCHOR_HTML.matcher(src).find()
                || RU_LABEL_LINE.matcher(src).find();

        if (!hasVkPlaceholders) {
            // Нечего чистить
            return new Result(Status.UNCHANGED);
        }

        if (!hasRealMedia) {
            // Предосторожность: чтобы не удалить единственный «след» картинки
            System.out.println("SKIP (no real media)  " + repoRoot.relativize(md));
            return new Result(Status.SKIPPED);
        }

        String cleaned = removeVkPlaceholders(src);
        if (cleaned.equals(src)) {
            return new Result(Status.UNCHANGED);
        }

        System.out.println("CLEAN  " + repoRoot.relativize(md));
        if (apply) {
            Path bak = md.resolveSibling(md.getFileName().toString() + ".bak");
            if (!Files.exists(bak)) {
                Files.writeString(bak, src, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
            }
            Files.writeString(md, cleaned, StandardCharsets.UTF_8, StandardOpenOption.TRUNCATE_EXISTING);
        }
        return new Result(Status.TOUCHED);
    }

    private static String removeVkPlaceholders(String src) {
        String s = src;

        // 1) убираем markdown-якоря [Вложение](https://vk.com/...)
        s = VK_ANCHOR_MD.matcher(s).replaceAll("");

        // 2) убираем html-ссылки <a href="https://vk.com/...">...</a>
        s = VK_ANCHOR_HTML.matcher(s).replaceAll("");

        // 3) убираем сырые строки-URL vk.com
        s = VK_RAW_URL_LINE.matcher(s).replaceAll("");

        // 4) убираем одиночные строки-лейблы ("Фотография", "Видео", "Аудио")
        s = RU_LABEL_LINE.matcher(s).replaceAll("");

        // 5) сжимаем «лишние» пустые строки
        s = EXTRA_BLANKS.matcher(s).replaceAll("\n\n");

        // 6) подчистим двойные пробелы возле переносов
        s = s.replaceAll("[ \\t]+\\n", "\n");

        return s;
    }

    private static void processLayoutForVkJs(Path defaultHtml) throws IOException {
        if (!Files.exists(defaultHtml)) {
            System.out.println("Layout not found: " + repoRoot.relativize(defaultHtml));
            return;
        }
        String src = Files.readString(defaultHtml, StandardCharsets.UTF_8);
        Pattern vkJs = Pattern.compile("(?m)^\\s*<script[^>]*vk-photos\\.js[^>]*>\\s*</script>\\s*$");
        Matcher m = vkJs.matcher(src);
        if (!m.find()) {
            System.out.println("vk-photos.js not referenced in layout (nothing to disable).");
            return;
        }
        String out = m.replaceAll("<!-- $0 -->");
        System.out.println("DISABLE vk-photos.js in " + repoRoot.relativize(defaultHtml));
        if (apply) {
            Path bak = defaultHtml.resolveSibling(defaultHtml.getFileName().toString() + ".bak");
            if (!Files.exists(bak)) {
                Files.writeString(bak, src, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
            }
            Files.writeString(defaultHtml, out, StandardCharsets.UTF_8, StandardOpenOption.TRUNCATE_EXISTING);
        }
    }
}
