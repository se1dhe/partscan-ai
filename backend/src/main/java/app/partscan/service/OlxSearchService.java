package app.partscan.service;

import app.partscan.entity.Part;
import app.partscan.entity.PartMarketListing;
import app.partscan.repository.PartMarketListingRepository;
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
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class OlxSearchService {
 private static final Logger log = LoggerFactory.getLogger(OlxSearchService.class);
 private static final Pattern PRICE_PATTERN = Pattern.compile("([0-9][0-9\\s]*)\\s*(грн|uah|uah|usd|\\$|eur)?", Pattern.CASE_INSENSITIVE);

 private final PartMarketListingRepository listingRepository;
 private final boolean enabled;
 private final int maxResults;

 public OlxSearchService(PartMarketListingRepository listingRepository, @Value("${olx.enabled:true}") boolean enabled, @Value("${olx.max-results:5}") int maxResults) {
  this.listingRepository = listingRepository;
  this.enabled = enabled;
  this.maxResults = Math.max(1, Math.min(maxResults, 8));
 }

 @Transactional
 public void refreshListings(Part part) {
  if (!enabled || part == null || part.getId() == null) return;
  List<String> queries = buildQueries(part);
  if (queries.isEmpty()) return;

  List<PartMarketListing> found = new ArrayList<>();
  for (String query : queries) {
   if (found.size() >= maxResults) break;
   try {
    found.addAll(search(query, part, maxResults - found.size()));
   } catch (Exception error) {
    log.warn("OLX search failed: partId={}, query={}, message={}", part.getId(), query, error.getMessage());
   }
  }

  listingRepository.deleteByPartId(part.getId());
  if (!found.isEmpty()) listingRepository.saveAll(found);
  log.info("OLX listings refreshed: partId={}, found={}", part.getId(), found.size());
 }

 private List<String> buildQueries(Part part) {
  Set<String> queries = new LinkedHashSet<>();
  addIfUseful(queries, part.getArticleNumber());
  addIfUseful(queries, join(part.getManufacturer(), part.getArticleNumber()));
  addIfUseful(queries, join(part.getManufacturer(), part.getName()));
  addIfUseful(queries, part.getName());
  addIfUseful(queries, part.getNormalizedName());
  return queries.stream().limit(4).toList();
 }

 private void addIfUseful(Set<String> queries, String value) {
  if (!StringUtils.hasText(value)) return;
  String cleaned = value.replace("unknown", "").replace("Неизвестная деталь", "").trim();
  if (cleaned.length() >= 3) queries.add(cleaned);
 }

 private String join(String first, String second) {
  List<String> values = new ArrayList<>();
  if (StringUtils.hasText(first) && !"unknown".equalsIgnoreCase(first.trim())) values.add(first.trim());
  if (StringUtils.hasText(second) && !"unknown".equalsIgnoreCase(second.trim())) values.add(second.trim());
  return String.join(" ", values);
 }

 private List<PartMarketListing> search(String query, Part part, int limit) throws IOException {
  String url = UriComponentsBuilder.fromHttpUrl("https://www.olx.ua/uk/list/")
   .pathSegment("q-" + query.trim().replace(' ', '-'))
   .queryParam("search[filter_float_price:from]", "1")
   .build()
   .encode()
   .toUriString();

  Document document = Jsoup.connect(url)
   .userAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")
   .timeout((int) Duration.ofSeconds(8).toMillis())
   .followRedirects(true)
   .get();

  List<PartMarketListing> listings = new ArrayList<>();
  for (Element card : document.select("[data-cy=l-card], div[data-testid=l-card], .css-1sw7q4x")) {
   if (listings.size() >= limit) break;
   PartMarketListing listing = parseCard(card, part, query);
   if (listing != null && listings.stream().noneMatch(item -> safe(item.getUrl()).equals(safe(listing.getUrl())))) listings.add(listing);
  }
  return listings;
 }

 private PartMarketListing parseCard(Element card, Part part, String query) {
  Element link = card.selectFirst("a[href]");
  if (link == null) return null;
  String title = text(card.selectFirst("h6, h4, [data-cy=ad-card-title], [data-testid=ad-title]"));
  if (!StringUtils.hasText(title)) title = text(link);
  if (!StringUtils.hasText(title)) return null;

  String href = link.attr("abs:href");
  if (!StringUtils.hasText(href)) href = "https://www.olx.ua" + link.attr("href");
  String priceText = text(card.selectFirst("[data-testid=ad-price], p[data-testid=ad-price], .css-uj7mm0"));

  PartMarketListing listing = new PartMarketListing();
  listing.setPart(part);
  listing.setSource("OLX");
  listing.setTitle(title);
  listing.setPrice(parsePrice(priceText));
  listing.setCurrency(parseCurrency(priceText));
  listing.setUrl(href);
  listing.setLocation(text(card.selectFirst("[data-testid=location-date], .css-veheph")));
  Element image = card.selectFirst("img[src]");
  listing.setImageUrl(image == null ? null : image.attr("abs:src"));
  listing.setMatchedQuery(query);
  return listing;
 }

 private Integer parsePrice(String value) {
  if (!StringUtils.hasText(value)) return null;
  Matcher matcher = PRICE_PATTERN.matcher(value.replace('\u00A0', ' '));
  if (!matcher.find()) return null;
  String digits = matcher.group(1).replaceAll("\\s+", "");
  try { return Integer.parseInt(digits); } catch (NumberFormatException ignored) { return null; }
 }

 private String parseCurrency(String value) {
  if (!StringUtils.hasText(value)) return "UAH";
  String lower = value.toLowerCase();
  if (lower.contains("$") || lower.contains("usd")) return "USD";
  if (lower.contains("eur")) return "EUR";
  return "UAH";
 }

 private String text(Element element) { return element == null ? "" : element.text().trim(); }
 private String safe(String value) { return value == null ? "" : value; }
}
