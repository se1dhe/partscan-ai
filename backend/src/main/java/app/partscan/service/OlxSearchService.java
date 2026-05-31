package app.partscan.service;

import app.partscan.entity.Part;
import app.partscan.entity.PartMarketListing;
import app.partscan.repository.PartMarketListingRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;
import java.text.Normalizer;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class OlxSearchService {
 private static final Logger log = LoggerFactory.getLogger(OlxSearchService.class);
 private static final Pattern PRICE_PATTERN = Pattern.compile("([0-9][0-9\\s]*)\\s*(грн|uah|usd|\\$|eur)?", Pattern.CASE_INSENSITIVE);
 private static final Pattern ARTICLE_PATTERN = Pattern.compile("[a-zA-ZА-Яа-я0-9][a-zA-ZА-Яа-я0-9 ._/-]{4,}");

 private final PartMarketListingRepository listingRepository;
 private final ObjectMapper objectMapper;
 private final boolean enabled;
 private final int maxResults;

 public OlxSearchService(PartMarketListingRepository listingRepository, ObjectMapper objectMapper, @Value("${olx.enabled:true}") boolean enabled, @Value("${olx.max-results:5}") int maxResults) {
  this.listingRepository = listingRepository;
  this.objectMapper = objectMapper;
  this.enabled = enabled;
  this.maxResults = Math.max(1, Math.min(maxResults, 8));
 }

 @Transactional
 public void refreshListings(Part part) {
  if (!enabled || part == null || part.getId() == null) return;
  List<String> queries = buildQueries(part);
  if (queries.isEmpty()) return;

  List<ScoredListing> scored = new ArrayList<>();
  int rawCards = 0;
  for (String query : queries) {
   try {
    List<PartMarketListing> candidates = search(query, part, maxResults * 4);
    rawCards += candidates.size();
    for (PartMarketListing listing : candidates) {
     int score = relevanceScore(part, listing, query);
     if (score >= minimumScore(part) && scored.stream().noneMatch(item -> safe(item.listing().getUrl()).equals(safe(listing.getUrl())))) {
      scored.add(new ScoredListing(listing, score));
     }
    }
   } catch (Exception error) {
    log.warn("OLX search failed: partId={}, query={}, message={}", part.getId(), query, error.getMessage());
   }
  }

  if (scored.isEmpty()) {
   log.info("OLX strict match is empty, using soft fallback: partId={}, rawCards={}", part.getId(), rawCards);
   for (String query : softQueries(part)) {
    try {
     List<PartMarketListing> candidates = search(query, part, maxResults);
     rawCards += candidates.size();
     for (PartMarketListing listing : candidates) {
      int score = Math.max(1, relevanceScore(part, listing, query));
      if (scored.stream().noneMatch(item -> safe(item.listing().getUrl()).equals(safe(listing.getUrl())))) scored.add(new ScoredListing(listing, score));
     }
    } catch (Exception error) {
     log.warn("OLX fallback failed: partId={}, query={}, message={}", part.getId(), query, error.getMessage());
    }
    if (scored.size() >= maxResults) break;
   }
  }

  List<PartMarketListing> found = scored.stream()
   .sorted(Comparator.comparingInt(ScoredListing::score).reversed().thenComparing(item -> item.listing().getPrice() == null ? Integer.MAX_VALUE : item.listing().getPrice()))
   .limit(maxResults)
   .map(ScoredListing::listing)
   .toList();

  listingRepository.deleteByPartId(part.getId());
  if (!found.isEmpty()) listingRepository.saveAll(found);
  log.info("OLX listings refreshed: partId={}, queries={}, rawCards={}, kept={}, found={}", part.getId(), queries, rawCards, scored.size(), found.size());
 }

 private List<String> buildQueries(Part part) {
  Set<String> queries = new LinkedHashSet<>();
  for (String query : parseJsonArray(part.getSearchQueries())) addIfUseful(queries, query);
  String article = cleanArticle(part.getArticleNumber());
  String articleSpaced = article.replaceAll("([A-Za-zА-Яа-я]+)([0-9])", "$1 $2").replaceAll("([0-9])([A-Za-zА-Яа-я]+)", "$1 $2");
  String manufacturer = clean(part.getManufacturer());
  String name = bestName(part);
  String normalizedName = clean(part.getNormalizedName());
  String componentName = clean(part.getVisibleComponentName());
  String assemblyName = clean(part.getAssemblyName());

  addIfUseful(queries, article);
  addIfUseful(queries, articleSpaced);
  addIfUseful(queries, join(article, componentName));
  addIfUseful(queries, join(article, name));
  addIfUseful(queries, join(manufacturer, article));
  addIfUseful(queries, join(manufacturer, componentName));
  addIfUseful(queries, join(componentName, assemblyName));
  addIfUseful(queries, name);
  addIfUseful(queries, normalizedName);
  return queries.stream().limit(7).toList();
 }

 private List<String> softQueries(Part part) {
  Set<String> queries = new LinkedHashSet<>();
  addIfUseful(queries, cleanArticle(part.getArticleNumber()));
  addIfUseful(queries, bestName(part));
  addIfUseful(queries, clean(part.getVisibleComponentName()));
  addIfUseful(queries, join(clean(part.getManufacturer()), bestName(part)));
  return queries.stream().limit(4).toList();
 }

 private String bestName(Part part) {
  if (StringUtils.hasText(part.getVisibleComponentName())) return part.getVisibleComponentName();
  return clean(part.getName());
 }

 private int minimumScore(Part part) {
  String article = cleanArticle(part.getArticleNumber());
  return StringUtils.hasText(article) && article.length() >= 5 ? 3 : 2;
 }

 private int relevanceScore(Part part, PartMarketListing listing, String query) {
  String haystack = normalize(listing.getTitle() + " " + listing.getLocation() + " " + listing.getMatchedQuery());
  String name = normalize(part.getName());
  String componentName = normalize(part.getVisibleComponentName());
  String assemblyName = normalize(part.getAssemblyName());
  String category = normalize(part.getCategory());
  String manufacturer = normalize(part.getManufacturer());
  String article = normalize(cleanArticle(part.getArticleNumber()));
  String articleSpaced = normalize(cleanArticle(part.getArticleNumber()).replaceAll("([A-Za-zА-Яа-я]+)([0-9])", "$1 $2").replaceAll("([0-9])([A-Za-zА-Яа-я]+)", "$1 $2"));
  String queryText = normalize(query);

  int score = 0;
  if (StringUtils.hasText(article) && article.length() >= 5 && haystack.contains(article)) score += 10;
  if (StringUtils.hasText(articleSpaced) && articleSpaced.length() >= 5 && haystack.contains(articleSpaced)) score += 10;
  if (StringUtils.hasText(manufacturer) && !"unknown".equals(manufacturer) && haystack.contains(manufacturer)) score += 3;
  for (String token : importantTokens(componentName)) if (haystack.contains(token)) score += 3;
  for (String token : importantTokens(name)) if (haystack.contains(token)) score += 2;
  for (String token : importantTokens(assemblyName)) if (haystack.contains(token)) score += 1;
  for (String token : importantTokens(category)) if (haystack.contains(token)) score += 1;
  for (String token : importantTokens(queryText)) if (haystack.contains(token)) score += 1;
  if (listing.getPrice() != null && listing.getPrice() > 0) score += 1;
  return score;
 }

 private List<String> importantTokens(String value) {
  if (!StringUtils.hasText(value)) return List.of();
  List<String> tokens = new ArrayList<>();
  for (String token : value.split("[^a-zа-я0-9]+")) {
   if (token.length() >= 3 && !List.of("unknown", "деталь", "корпус", "система", "часть", "запчасть", "узел").contains(token)) tokens.add(token);
  }
  return tokens.stream().distinct().limit(7).toList();
 }

 private List<String> parseJsonArray(String value) {
  if (!StringUtils.hasText(value)) return List.of();
  try {
   JsonNode node = objectMapper.readTree(value);
   if (!node.isArray()) return List.of();
   List<String> values = new ArrayList<>();
   for (JsonNode item : node) if (item.isTextual() && StringUtils.hasText(item.asText())) values.add(item.asText());
   return values;
  } catch (Exception ignored) {
   return List.of();
  }
 }

 private void addIfUseful(Set<String> queries, String value) {
  String cleaned = clean(value);
  if (cleaned.length() >= 3 && !"unknown".equalsIgnoreCase(cleaned) && !"неизвестная деталь".equalsIgnoreCase(cleaned)) queries.add(cleaned);
 }

 private String join(String first, String second) {
  List<String> values = new ArrayList<>();
  if (StringUtils.hasText(first) && !"unknown".equalsIgnoreCase(first.trim())) values.add(first.trim());
  if (StringUtils.hasText(second) && !"unknown".equalsIgnoreCase(second.trim())) values.add(second.trim());
  return String.join(" ", values);
 }

 private String clean(String value) { return value == null ? "" : value.replace("unknown", "").replace("Неизвестная деталь", "").trim(); }

 private String cleanArticle(String value) {
  if (!StringUtils.hasText(value)) return "";
  Matcher matcher = ARTICLE_PATTERN.matcher(value);
  return matcher.find() ? matcher.group().replaceAll("\\s+", "").trim() : value.trim();
 }

 private List<PartMarketListing> search(String query, Part part, int limit) throws IOException {
  String url = UriComponentsBuilder.fromHttpUrl("https://www.olx.ua/uk/list/")
   .queryParam("q", query.trim())
   .queryParam("search[filter_float_price:from]", "1")
   .build()
   .encode()
   .toUriString();

  Document document = Jsoup.connect(url)
   .userAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")
   .referrer("https://www.olx.ua/")
   .timeout((int) Duration.ofSeconds(10).toMillis())
   .followRedirects(true)
   .get();

  List<PartMarketListing> listings = new ArrayList<>();
  for (Element card : document.select("[data-cy='l-card'], div[data-testid='l-card'], div[data-testid='listing-grid'] div:has(a[href*='/d/uk/obyavlenie/']), div:has(a[href*='/d/obyavlenie/'])")) {
   if (listings.size() >= limit) break;
   PartMarketListing listing = parseCard(card, part, query);
   if (listing != null && listings.stream().noneMatch(item -> safe(item.getUrl()).equals(safe(listing.getUrl())))) listings.add(listing);
  }
  log.info("OLX query parsed: partId={}, query={}, cards={}", part.getId(), query, listings.size());
  return listings;
 }

 private PartMarketListing parseCard(Element card, Part part, String query) {
  Element link = card.selectFirst("a[href*='/d/uk/obyavlenie/'], a[href*='/d/obyavlenie/'], a[href]");
  if (link == null) return null;
  String title = text(card.selectFirst("h6, h4, [data-cy='ad-card-title'], [data-testid='ad-title']"));
  if (!StringUtils.hasText(title)) title = text(link);
  if (!StringUtils.hasText(title)) return null;

  String href = link.attr("abs:href");
  if (!StringUtils.hasText(href)) href = "https://www.olx.ua" + link.attr("href");
  if (!href.contains("olx.ua") || !href.contains("/d/")) return null;

  String priceText = text(card.selectFirst("[data-testid='ad-price'], p[data-testid='ad-price']"));
  if (!StringUtils.hasText(priceText)) priceText = firstPriceLikeText(card);

  PartMarketListing listing = new PartMarketListing();
  listing.setPart(part);
  listing.setSource("OLX");
  listing.setTitle(title);
  listing.setPrice(parsePrice(priceText));
  listing.setCurrency(parseCurrency(priceText));
  listing.setUrl(href.split("#")[0]);
  listing.setLocation(text(card.selectFirst("[data-testid='location-date']")));
  Element image = card.selectFirst("img[src]");
  listing.setImageUrl(image == null ? null : image.attr("abs:src"));
  listing.setMatchedQuery(query);
  return listing;
 }

 private String firstPriceLikeText(Element card) {
  for (Element element : card.select("p, span")) {
   String value = element.text();
   if (StringUtils.hasText(value) && PRICE_PATTERN.matcher(value.replace('\u00A0', ' ')).find()) return value;
  }
  return "";
 }

 private Integer parsePrice(String value) {
  if (!StringUtils.hasText(value)) return null;
  Matcher matcher = PRICE_PATTERN.matcher(value.replace('\u00A0', ' '));
  if (!matcher.find()) return null;
  try { return Integer.parseInt(matcher.group(1).replaceAll("\\s+", "")); }
  catch (NumberFormatException ignored) { return null; }
 }

 private String parseCurrency(String value) {
  if (!StringUtils.hasText(value)) return "UAH";
  String lower = value.toLowerCase(Locale.ROOT);
  if (lower.contains("$") || lower.contains("usd")) return "USD";
  if (lower.contains("eur")) return "EUR";
  return "UAH";
 }

 private String normalize(String value) {
  if (!StringUtils.hasText(value)) return "";
  return Normalizer.normalize(value.toLowerCase(Locale.ROOT), Normalizer.Form.NFKC).replace('і', 'и').replace('ї', 'и').replace('є', 'е').replaceAll("[^a-zа-я0-9]+", " ").trim();
 }

 private String text(Element element) { return element == null ? "" : element.text().trim(); }
 private String safe(String value) { return value == null ? "" : value; }
 private record ScoredListing(PartMarketListing listing, int score) {}
}
